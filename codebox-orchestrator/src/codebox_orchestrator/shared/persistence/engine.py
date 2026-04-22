"""SQLAlchemy async engine and session factory."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy.dialects.postgresql.asyncpg import AsyncAdapt_asyncpg_connection
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from codebox_orchestrator.config import settings

logger = logging.getLogger(__name__)


def _install_terminate_cancel_shield() -> None:
    """Swallow ``CancelledError`` escaping the asyncpg adapter's ``terminate()``.

    Background -- when the pool invalidates a connection (``pool_pre_ping``
    failure, ``pool_recycle`` eviction, checkin of a soft-invalidated
    connection, etc.), ``pool._close_connection`` calls
    ``dialect.do_terminate(connection)`` which routes through
    ``AsyncAdapt_terminate.terminate``.  That method attempts a graceful
    async close via SQLAlchemy's greenlet bridge; if the calling task has
    been cancelled (Starlette/uvicorn cancel scope on client disconnect,
    request timeout, etc.), the greenlet ``await_`` re-raises
    ``CancelledError``.  SQLAlchemy catches it, runs
    ``_terminate_force_close()`` to drop the connection, and then
    deliberately re-raises so cooperative cancellation is preserved.

    The re-raised ``CancelledError`` escapes ``pool._close_connection``
    before the pool can finish its bookkeeping (marking the record as
    checked-in / discarded), so the ``_ConnectionRecord`` is left in a
    "non-checked-in" state.  Python eventually GC's it with::

        The garbage collector is trying to clean up non-checked-in
        connection <AdaptedConnection ...>, which will be terminated.

    Since ``_terminate_force_close()`` has already hard-dropped the
    underlying asyncpg connection by the time we get here, there is
    nothing meaningful left to cancel -- the only thing swallowing the
    error changes is whether the pool's own bookkeeping completes.  The
    outer cancelled task will re-observe the cancellation at its next
    ``await`` point, so cooperative cancellation semantics are preserved.

    This mirrors the ``_ShieldedCloseAsyncSession`` mitigation below but
    applies to the pool-side termination path, which the session-level
    shield does not cover.
    """
    original_terminate = AsyncAdapt_asyncpg_connection.terminate

    def _safe_terminate(self: AsyncAdapt_asyncpg_connection) -> None:
        try:
            original_terminate(self)
        except asyncio.CancelledError:
            # _terminate_force_close() already ran inside ``original_terminate``
            # before the re-raise, so the connection is gone.  Let the pool
            # finish cleanly; the cancelled task will see its cancellation on
            # the next await.
            logger.debug(
                "Swallowed CancelledError from asyncpg terminate(); "
                "connection already force-closed."
            )

    AsyncAdapt_asyncpg_connection.terminate = _safe_terminate  # type: ignore[method-assign]


_install_terminate_cancel_shield()

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=300,
)


class _ShieldedCloseAsyncSession(AsyncSession):
    """``AsyncSession`` whose ``__aexit__`` shields ``close()`` from cancellation.

    Motivation — when uvicorn cancels the request task (client disconnect on a
    keep-alive connection, request timeout, etc.) while a repository is inside
    its ``async with session_factory() as session`` block, the cancellation
    lands inside ``session.close()`` / asyncpg's ``_terminate_graceful_close``.
    SQLAlchemy's asyncpg connector wraps that call in ``asyncio.shield``, but
    its greenlet bridge still re-raises ``CancelledError`` to the caller, so
    the pool never cleanly checks the connection back in and the underlying
    asyncpg connection is left half-terminated.  Python later GC's it with:

        "The garbage collector is trying to clean up non-checked-in
        connection <AdaptedConnection ...>, which will be terminated."

    Wrapping ``close()`` in ``asyncio.shield`` here lets the close coroutine
    run to completion in the background even when the calling task is being
    torn down, so the connection is returned to the pool normally.  The
    ``CancelledError`` is still re-raised to the caller afterwards, preserving
    cooperative-cancellation semantics.

    See also ``RefreshAuthCookieMiddleware`` in ``api/app.py`` for the
    related middleware-side mitigation.
    """

    async def __aexit__(self, type_: Any, value: Any, traceback: Any) -> None:
        # asyncio.shield lets close() run to completion as a detached task
        # even if the caller gets cancelled; CancelledError still surfaces
        # back to the caller via normal propagation.
        await asyncio.shield(self.close())


async_session_factory = async_sessionmaker(
    engine,
    class_=_ShieldedCloseAsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields an async database session."""
    async with async_session_factory() as session:
        yield session
