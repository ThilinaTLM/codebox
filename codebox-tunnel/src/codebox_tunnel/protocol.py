"""Connect-header protocol constants for yamux tunnel streams.

Each yamux stream begins with a 3-byte connect header sent by the
stream opener, followed by a 1-byte status reply from the acceptor:

    Opener  →  [version(1) | target_port(2 big-endian)]
    Acceptor →  [status(1)]

If status is ``STATUS_OK`` the stream is connected and bytes flow
bidirectionally.  Otherwise the opener should close the stream.
"""

from __future__ import annotations

import struct

# -- Connect header ----------------------------------------------------------

PROTOCOL_VERSION: int = 0x01
CONNECT_HEADER_FMT: str = ">BH"  # version(1) + port(2, big-endian)
CONNECT_HEADER_SIZE: int = struct.calcsize(CONNECT_HEADER_FMT)  # 3 bytes

# -- Status codes ------------------------------------------------------------

STATUS_OK: int = 0x00
STATUS_PORT_NOT_ALLOWED: int = 0x01
STATUS_DIAL_FAILED: int = 0x02
STATUS_UNSUPPORTED_VERSION: int = 0x03

# -- Well-known ports --------------------------------------------------------

FILE_SERVER_PORT: int = 19080
PTY_SERVER_PORT: int = 19081
