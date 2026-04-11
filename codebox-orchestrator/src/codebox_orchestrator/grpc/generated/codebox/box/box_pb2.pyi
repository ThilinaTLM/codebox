from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class CommandOrigin(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    COMMAND_ORIGIN_UNSPECIFIED: _ClassVar[CommandOrigin]
    COMMAND_ORIGIN_AGENT_TOOL: _ClassVar[CommandOrigin]
    COMMAND_ORIGIN_USER_EXEC: _ClassVar[CommandOrigin]
COMMAND_ORIGIN_UNSPECIFIED: CommandOrigin
COMMAND_ORIGIN_AGENT_TOOL: CommandOrigin
COMMAND_ORIGIN_USER_EXEC: CommandOrigin

class BoxEvent(_message.Message):
    __slots__ = ("register", "stream_event", "query_result")
    REGISTER_FIELD_NUMBER: _ClassVar[int]
    STREAM_EVENT_FIELD_NUMBER: _ClassVar[int]
    QUERY_RESULT_FIELD_NUMBER: _ClassVar[int]
    register: RegisterEvent
    stream_event: StreamEvent
    query_result: QueryResult
    def __init__(self, register: _Optional[_Union[RegisterEvent, _Mapping]] = ..., stream_event: _Optional[_Union[StreamEvent, _Mapping]] = ..., query_result: _Optional[_Union[QueryResult, _Mapping]] = ...) -> None: ...

class RegisterEvent(_message.Message):
    __slots__ = ("session_id",)
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    session_id: str
    def __init__(self, session_id: _Optional[str] = ...) -> None: ...

class StreamEvent(_message.Message):
    __slots__ = ("seq", "event_id", "timestamp_ms", "run_id", "turn_id", "message_id", "tool_call_id", "command_id", "run_started", "run_completed", "run_failed", "run_cancelled", "turn_started", "turn_completed", "message_started", "message_delta", "message_completed", "reasoning_started", "reasoning_delta", "reasoning_completed", "tool_call_started", "tool_call_arguments_delta", "tool_call_arguments_completed", "tool_call_completed", "tool_call_failed", "command_started", "command_output_delta", "command_completed", "command_failed", "state_changed", "outcome_declared", "input_requested")
    SEQ_FIELD_NUMBER: _ClassVar[int]
    EVENT_ID_FIELD_NUMBER: _ClassVar[int]
    TIMESTAMP_MS_FIELD_NUMBER: _ClassVar[int]
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    TURN_ID_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_ID_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALL_ID_FIELD_NUMBER: _ClassVar[int]
    COMMAND_ID_FIELD_NUMBER: _ClassVar[int]
    RUN_STARTED_FIELD_NUMBER: _ClassVar[int]
    RUN_COMPLETED_FIELD_NUMBER: _ClassVar[int]
    RUN_FAILED_FIELD_NUMBER: _ClassVar[int]
    RUN_CANCELLED_FIELD_NUMBER: _ClassVar[int]
    TURN_STARTED_FIELD_NUMBER: _ClassVar[int]
    TURN_COMPLETED_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_STARTED_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_DELTA_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_COMPLETED_FIELD_NUMBER: _ClassVar[int]
    REASONING_STARTED_FIELD_NUMBER: _ClassVar[int]
    REASONING_DELTA_FIELD_NUMBER: _ClassVar[int]
    REASONING_COMPLETED_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALL_STARTED_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALL_ARGUMENTS_DELTA_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALL_ARGUMENTS_COMPLETED_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALL_COMPLETED_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALL_FAILED_FIELD_NUMBER: _ClassVar[int]
    COMMAND_STARTED_FIELD_NUMBER: _ClassVar[int]
    COMMAND_OUTPUT_DELTA_FIELD_NUMBER: _ClassVar[int]
    COMMAND_COMPLETED_FIELD_NUMBER: _ClassVar[int]
    COMMAND_FAILED_FIELD_NUMBER: _ClassVar[int]
    STATE_CHANGED_FIELD_NUMBER: _ClassVar[int]
    OUTCOME_DECLARED_FIELD_NUMBER: _ClassVar[int]
    INPUT_REQUESTED_FIELD_NUMBER: _ClassVar[int]
    seq: int
    event_id: str
    timestamp_ms: int
    run_id: str
    turn_id: str
    message_id: str
    tool_call_id: str
    command_id: str
    run_started: RunStarted
    run_completed: RunCompleted
    run_failed: RunFailed
    run_cancelled: RunCancelled
    turn_started: TurnStarted
    turn_completed: TurnCompleted
    message_started: MessageStarted
    message_delta: MessageDelta
    message_completed: MessageCompleted
    reasoning_started: ReasoningStarted
    reasoning_delta: ReasoningDelta
    reasoning_completed: ReasoningCompleted
    tool_call_started: ToolCallStarted
    tool_call_arguments_delta: ToolCallArgumentsDelta
    tool_call_arguments_completed: ToolCallArgumentsCompleted
    tool_call_completed: ToolCallCompleted
    tool_call_failed: ToolCallFailed
    command_started: CommandStarted
    command_output_delta: CommandOutputDelta
    command_completed: CommandCompleted
    command_failed: CommandFailed
    state_changed: StateChanged
    outcome_declared: OutcomeDeclared
    input_requested: InputRequested
    def __init__(self, seq: _Optional[int] = ..., event_id: _Optional[str] = ..., timestamp_ms: _Optional[int] = ..., run_id: _Optional[str] = ..., turn_id: _Optional[str] = ..., message_id: _Optional[str] = ..., tool_call_id: _Optional[str] = ..., command_id: _Optional[str] = ..., run_started: _Optional[_Union[RunStarted, _Mapping]] = ..., run_completed: _Optional[_Union[RunCompleted, _Mapping]] = ..., run_failed: _Optional[_Union[RunFailed, _Mapping]] = ..., run_cancelled: _Optional[_Union[RunCancelled, _Mapping]] = ..., turn_started: _Optional[_Union[TurnStarted, _Mapping]] = ..., turn_completed: _Optional[_Union[TurnCompleted, _Mapping]] = ..., message_started: _Optional[_Union[MessageStarted, _Mapping]] = ..., message_delta: _Optional[_Union[MessageDelta, _Mapping]] = ..., message_completed: _Optional[_Union[MessageCompleted, _Mapping]] = ..., reasoning_started: _Optional[_Union[ReasoningStarted, _Mapping]] = ..., reasoning_delta: _Optional[_Union[ReasoningDelta, _Mapping]] = ..., reasoning_completed: _Optional[_Union[ReasoningCompleted, _Mapping]] = ..., tool_call_started: _Optional[_Union[ToolCallStarted, _Mapping]] = ..., tool_call_arguments_delta: _Optional[_Union[ToolCallArgumentsDelta, _Mapping]] = ..., tool_call_arguments_completed: _Optional[_Union[ToolCallArgumentsCompleted, _Mapping]] = ..., tool_call_completed: _Optional[_Union[ToolCallCompleted, _Mapping]] = ..., tool_call_failed: _Optional[_Union[ToolCallFailed, _Mapping]] = ..., command_started: _Optional[_Union[CommandStarted, _Mapping]] = ..., command_output_delta: _Optional[_Union[CommandOutputDelta, _Mapping]] = ..., command_completed: _Optional[_Union[CommandCompleted, _Mapping]] = ..., command_failed: _Optional[_Union[CommandFailed, _Mapping]] = ..., state_changed: _Optional[_Union[StateChanged, _Mapping]] = ..., outcome_declared: _Optional[_Union[OutcomeDeclared, _Mapping]] = ..., input_requested: _Optional[_Union[InputRequested, _Mapping]] = ...) -> None: ...

class RunStarted(_message.Message):
    __slots__ = ("trigger", "input")
    TRIGGER_FIELD_NUMBER: _ClassVar[int]
    INPUT_FIELD_NUMBER: _ClassVar[int]
    trigger: str
    input: str
    def __init__(self, trigger: _Optional[str] = ..., input: _Optional[str] = ...) -> None: ...

class RunCompleted(_message.Message):
    __slots__ = ("summary",)
    SUMMARY_FIELD_NUMBER: _ClassVar[int]
    summary: str
    def __init__(self, summary: _Optional[str] = ...) -> None: ...

class RunFailed(_message.Message):
    __slots__ = ("error",)
    ERROR_FIELD_NUMBER: _ClassVar[int]
    error: str
    def __init__(self, error: _Optional[str] = ...) -> None: ...

class RunCancelled(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class TurnStarted(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class TurnCompleted(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class MessageStarted(_message.Message):
    __slots__ = ("role",)
    ROLE_FIELD_NUMBER: _ClassVar[int]
    role: str
    def __init__(self, role: _Optional[str] = ...) -> None: ...

class MessageDelta(_message.Message):
    __slots__ = ("text",)
    TEXT_FIELD_NUMBER: _ClassVar[int]
    text: str
    def __init__(self, text: _Optional[str] = ...) -> None: ...

class MessageCompleted(_message.Message):
    __slots__ = ("role", "content")
    ROLE_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    role: str
    content: str
    def __init__(self, role: _Optional[str] = ..., content: _Optional[str] = ...) -> None: ...

class ReasoningStarted(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ReasoningDelta(_message.Message):
    __slots__ = ("text",)
    TEXT_FIELD_NUMBER: _ClassVar[int]
    text: str
    def __init__(self, text: _Optional[str] = ...) -> None: ...

class ReasoningCompleted(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ToolCallStarted(_message.Message):
    __slots__ = ("name",)
    NAME_FIELD_NUMBER: _ClassVar[int]
    name: str
    def __init__(self, name: _Optional[str] = ...) -> None: ...

class ToolCallArgumentsDelta(_message.Message):
    __slots__ = ("text",)
    TEXT_FIELD_NUMBER: _ClassVar[int]
    text: str
    def __init__(self, text: _Optional[str] = ...) -> None: ...

class ToolCallArgumentsCompleted(_message.Message):
    __slots__ = ("arguments_json",)
    ARGUMENTS_JSON_FIELD_NUMBER: _ClassVar[int]
    arguments_json: str
    def __init__(self, arguments_json: _Optional[str] = ...) -> None: ...

class ToolCallCompleted(_message.Message):
    __slots__ = ("name", "output")
    NAME_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    name: str
    output: str
    def __init__(self, name: _Optional[str] = ..., output: _Optional[str] = ...) -> None: ...

class ToolCallFailed(_message.Message):
    __slots__ = ("name", "error", "output")
    NAME_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    name: str
    error: str
    output: str
    def __init__(self, name: _Optional[str] = ..., error: _Optional[str] = ..., output: _Optional[str] = ...) -> None: ...

class CommandStarted(_message.Message):
    __slots__ = ("origin", "command", "timeout_seconds")
    ORIGIN_FIELD_NUMBER: _ClassVar[int]
    COMMAND_FIELD_NUMBER: _ClassVar[int]
    TIMEOUT_SECONDS_FIELD_NUMBER: _ClassVar[int]
    origin: CommandOrigin
    command: str
    timeout_seconds: int
    def __init__(self, origin: _Optional[_Union[CommandOrigin, str]] = ..., command: _Optional[str] = ..., timeout_seconds: _Optional[int] = ...) -> None: ...

class CommandOutputDelta(_message.Message):
    __slots__ = ("text",)
    TEXT_FIELD_NUMBER: _ClassVar[int]
    text: str
    def __init__(self, text: _Optional[str] = ...) -> None: ...

class CommandCompleted(_message.Message):
    __slots__ = ("origin", "exit_code", "output")
    ORIGIN_FIELD_NUMBER: _ClassVar[int]
    EXIT_CODE_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    origin: CommandOrigin
    exit_code: int
    output: str
    def __init__(self, origin: _Optional[_Union[CommandOrigin, str]] = ..., exit_code: _Optional[int] = ..., output: _Optional[str] = ...) -> None: ...

class CommandFailed(_message.Message):
    __slots__ = ("origin", "exit_code", "error", "output")
    ORIGIN_FIELD_NUMBER: _ClassVar[int]
    EXIT_CODE_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    origin: CommandOrigin
    exit_code: int
    error: str
    output: str
    def __init__(self, origin: _Optional[_Union[CommandOrigin, str]] = ..., exit_code: _Optional[int] = ..., error: _Optional[str] = ..., output: _Optional[str] = ...) -> None: ...

class StateChanged(_message.Message):
    __slots__ = ("activity",)
    ACTIVITY_FIELD_NUMBER: _ClassVar[int]
    activity: str
    def __init__(self, activity: _Optional[str] = ...) -> None: ...

class OutcomeDeclared(_message.Message):
    __slots__ = ("status", "message")
    STATUS_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    status: str
    message: str
    def __init__(self, status: _Optional[str] = ..., message: _Optional[str] = ...) -> None: ...

class InputRequested(_message.Message):
    __slots__ = ("message", "questions")
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    QUESTIONS_FIELD_NUMBER: _ClassVar[int]
    message: str
    questions: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, message: _Optional[str] = ..., questions: _Optional[_Iterable[str]] = ...) -> None: ...

class QueryResult(_message.Message):
    __slots__ = ("request_id", "list_files", "read_file", "exec")
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    LIST_FILES_FIELD_NUMBER: _ClassVar[int]
    READ_FILE_FIELD_NUMBER: _ClassVar[int]
    EXEC_FIELD_NUMBER: _ClassVar[int]
    request_id: str
    list_files: ListFilesResult
    read_file: ReadFileResult
    exec: ExecResult
    def __init__(self, request_id: _Optional[str] = ..., list_files: _Optional[_Union[ListFilesResult, _Mapping]] = ..., read_file: _Optional[_Union[ReadFileResult, _Mapping]] = ..., exec: _Optional[_Union[ExecResult, _Mapping]] = ...) -> None: ...

class ListFilesResult(_message.Message):
    __slots__ = ("entries", "error")
    ENTRIES_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    entries: _containers.RepeatedCompositeFieldContainer[FileEntry]
    error: str
    def __init__(self, entries: _Optional[_Iterable[_Union[FileEntry, _Mapping]]] = ..., error: _Optional[str] = ...) -> None: ...

class FileEntry(_message.Message):
    __slots__ = ("name", "path", "is_dir", "size", "modified")
    NAME_FIELD_NUMBER: _ClassVar[int]
    PATH_FIELD_NUMBER: _ClassVar[int]
    IS_DIR_FIELD_NUMBER: _ClassVar[int]
    SIZE_FIELD_NUMBER: _ClassVar[int]
    MODIFIED_FIELD_NUMBER: _ClassVar[int]
    name: str
    path: str
    is_dir: bool
    size: int
    modified: str
    def __init__(self, name: _Optional[str] = ..., path: _Optional[str] = ..., is_dir: bool = ..., size: _Optional[int] = ..., modified: _Optional[str] = ...) -> None: ...

class ReadFileResult(_message.Message):
    __slots__ = ("content", "encoding", "truncated", "error")
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    ENCODING_FIELD_NUMBER: _ClassVar[int]
    TRUNCATED_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    content: str
    encoding: str
    truncated: bool
    error: str
    def __init__(self, content: _Optional[str] = ..., encoding: _Optional[str] = ..., truncated: bool = ..., error: _Optional[str] = ...) -> None: ...

class ExecResult(_message.Message):
    __slots__ = ("exit_code", "stdout", "stderr", "error")
    EXIT_CODE_FIELD_NUMBER: _ClassVar[int]
    STDOUT_FIELD_NUMBER: _ClassVar[int]
    STDERR_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    exit_code: int
    stdout: str
    stderr: str
    error: str
    def __init__(self, exit_code: _Optional[int] = ..., stdout: _Optional[str] = ..., stderr: _Optional[str] = ..., error: _Optional[str] = ...) -> None: ...

class BoxCommand(_message.Message):
    __slots__ = ("registered", "message", "cancel", "query")
    REGISTERED_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    CANCEL_FIELD_NUMBER: _ClassVar[int]
    QUERY_FIELD_NUMBER: _ClassVar[int]
    registered: RegisteredAck
    message: SendMessage
    cancel: CancelTask
    query: Query
    def __init__(self, registered: _Optional[_Union[RegisteredAck, _Mapping]] = ..., message: _Optional[_Union[SendMessage, _Mapping]] = ..., cancel: _Optional[_Union[CancelTask, _Mapping]] = ..., query: _Optional[_Union[Query, _Mapping]] = ...) -> None: ...

class RegisteredAck(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class SendMessage(_message.Message):
    __slots__ = ("content", "run_id", "message_id")
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_ID_FIELD_NUMBER: _ClassVar[int]
    content: str
    run_id: str
    message_id: str
    def __init__(self, content: _Optional[str] = ..., run_id: _Optional[str] = ..., message_id: _Optional[str] = ...) -> None: ...

class CancelTask(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class Query(_message.Message):
    __slots__ = ("request_id", "list_files", "read_file", "exec")
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    LIST_FILES_FIELD_NUMBER: _ClassVar[int]
    READ_FILE_FIELD_NUMBER: _ClassVar[int]
    EXEC_FIELD_NUMBER: _ClassVar[int]
    request_id: str
    list_files: ListFilesQuery
    read_file: ReadFileQuery
    exec: ExecQuery
    def __init__(self, request_id: _Optional[str] = ..., list_files: _Optional[_Union[ListFilesQuery, _Mapping]] = ..., read_file: _Optional[_Union[ReadFileQuery, _Mapping]] = ..., exec: _Optional[_Union[ExecQuery, _Mapping]] = ...) -> None: ...

class ListFilesQuery(_message.Message):
    __slots__ = ("path",)
    PATH_FIELD_NUMBER: _ClassVar[int]
    path: str
    def __init__(self, path: _Optional[str] = ...) -> None: ...

class ReadFileQuery(_message.Message):
    __slots__ = ("path",)
    PATH_FIELD_NUMBER: _ClassVar[int]
    path: str
    def __init__(self, path: _Optional[str] = ...) -> None: ...

class ExecQuery(_message.Message):
    __slots__ = ("command", "run_id", "command_id")
    COMMAND_FIELD_NUMBER: _ClassVar[int]
    RUN_ID_FIELD_NUMBER: _ClassVar[int]
    COMMAND_ID_FIELD_NUMBER: _ClassVar[int]
    command: str
    run_id: str
    command_id: str
    def __init__(self, command: _Optional[str] = ..., run_id: _Optional[str] = ..., command_id: _Optional[str] = ...) -> None: ...
