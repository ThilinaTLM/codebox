from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class BoxEvent(_message.Message):
    __slots__ = ("register", "done", "error", "agent_output", "state_change", "query_result")
    REGISTER_FIELD_NUMBER: _ClassVar[int]
    DONE_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    AGENT_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    STATE_CHANGE_FIELD_NUMBER: _ClassVar[int]
    QUERY_RESULT_FIELD_NUMBER: _ClassVar[int]
    register: RegisterEvent
    done: DoneEvent
    error: ErrorEvent
    agent_output: AgentOutput
    state_change: StateChange
    query_result: QueryResult
    def __init__(self, register: _Optional[_Union[RegisterEvent, _Mapping]] = ..., done: _Optional[_Union[DoneEvent, _Mapping]] = ..., error: _Optional[_Union[ErrorEvent, _Mapping]] = ..., agent_output: _Optional[_Union[AgentOutput, _Mapping]] = ..., state_change: _Optional[_Union[StateChange, _Mapping]] = ..., query_result: _Optional[_Union[QueryResult, _Mapping]] = ...) -> None: ...

class RegisterEvent(_message.Message):
    __slots__ = ("session_id",)
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    session_id: str
    def __init__(self, session_id: _Optional[str] = ...) -> None: ...

class DoneEvent(_message.Message):
    __slots__ = ("content",)
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    content: str
    def __init__(self, content: _Optional[str] = ...) -> None: ...

class ErrorEvent(_message.Message):
    __slots__ = ("detail",)
    DETAIL_FIELD_NUMBER: _ClassVar[int]
    detail: str
    def __init__(self, detail: _Optional[str] = ...) -> None: ...

class AgentOutput(_message.Message):
    __slots__ = ("token", "thinking", "model_started", "tool_started", "tool_output", "tool_finished", "message_completed", "exec_chunk")
    TOKEN_FIELD_NUMBER: _ClassVar[int]
    THINKING_FIELD_NUMBER: _ClassVar[int]
    MODEL_STARTED_FIELD_NUMBER: _ClassVar[int]
    TOOL_STARTED_FIELD_NUMBER: _ClassVar[int]
    TOOL_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    TOOL_FINISHED_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_COMPLETED_FIELD_NUMBER: _ClassVar[int]
    EXEC_CHUNK_FIELD_NUMBER: _ClassVar[int]
    token: TokenChunk
    thinking: ThinkingChunk
    model_started: ModelStarted
    tool_started: ToolStarted
    tool_output: ToolOutput
    tool_finished: ToolFinished
    message_completed: MessageCompleted
    exec_chunk: ExecChunk
    def __init__(self, token: _Optional[_Union[TokenChunk, _Mapping]] = ..., thinking: _Optional[_Union[ThinkingChunk, _Mapping]] = ..., model_started: _Optional[_Union[ModelStarted, _Mapping]] = ..., tool_started: _Optional[_Union[ToolStarted, _Mapping]] = ..., tool_output: _Optional[_Union[ToolOutput, _Mapping]] = ..., tool_finished: _Optional[_Union[ToolFinished, _Mapping]] = ..., message_completed: _Optional[_Union[MessageCompleted, _Mapping]] = ..., exec_chunk: _Optional[_Union[ExecChunk, _Mapping]] = ...) -> None: ...

class TokenChunk(_message.Message):
    __slots__ = ("text",)
    TEXT_FIELD_NUMBER: _ClassVar[int]
    text: str
    def __init__(self, text: _Optional[str] = ...) -> None: ...

class ThinkingChunk(_message.Message):
    __slots__ = ("text",)
    TEXT_FIELD_NUMBER: _ClassVar[int]
    text: str
    def __init__(self, text: _Optional[str] = ...) -> None: ...

class ModelStarted(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ToolStarted(_message.Message):
    __slots__ = ("name", "tool_call_id", "input_json")
    NAME_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALL_ID_FIELD_NUMBER: _ClassVar[int]
    INPUT_JSON_FIELD_NUMBER: _ClassVar[int]
    name: str
    tool_call_id: str
    input_json: str
    def __init__(self, name: _Optional[str] = ..., tool_call_id: _Optional[str] = ..., input_json: _Optional[str] = ...) -> None: ...

class ToolOutput(_message.Message):
    __slots__ = ("output", "tool_call_id")
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALL_ID_FIELD_NUMBER: _ClassVar[int]
    output: str
    tool_call_id: str
    def __init__(self, output: _Optional[str] = ..., tool_call_id: _Optional[str] = ...) -> None: ...

class ToolFinished(_message.Message):
    __slots__ = ("name", "output")
    NAME_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    name: str
    output: str
    def __init__(self, name: _Optional[str] = ..., output: _Optional[str] = ...) -> None: ...

class MessageCompleted(_message.Message):
    __slots__ = ("message",)
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    message: ChatMessage
    def __init__(self, message: _Optional[_Union[ChatMessage, _Mapping]] = ...) -> None: ...

class ExecChunk(_message.Message):
    __slots__ = ("output", "request_id")
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    output: str
    request_id: str
    def __init__(self, output: _Optional[str] = ..., request_id: _Optional[str] = ...) -> None: ...

class StateChange(_message.Message):
    __slots__ = ("activity", "outcome")
    ACTIVITY_FIELD_NUMBER: _ClassVar[int]
    OUTCOME_FIELD_NUMBER: _ClassVar[int]
    activity: ActivityChanged
    outcome: TaskOutcome
    def __init__(self, activity: _Optional[_Union[ActivityChanged, _Mapping]] = ..., outcome: _Optional[_Union[TaskOutcome, _Mapping]] = ...) -> None: ...

class ActivityChanged(_message.Message):
    __slots__ = ("status",)
    STATUS_FIELD_NUMBER: _ClassVar[int]
    status: str
    def __init__(self, status: _Optional[str] = ...) -> None: ...

class TaskOutcome(_message.Message):
    __slots__ = ("status", "message")
    STATUS_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    status: str
    message: str
    def __init__(self, status: _Optional[str] = ..., message: _Optional[str] = ...) -> None: ...

class QueryResult(_message.Message):
    __slots__ = ("request_id", "list_files", "read_file", "exec", "get_messages", "get_box_state")
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    LIST_FILES_FIELD_NUMBER: _ClassVar[int]
    READ_FILE_FIELD_NUMBER: _ClassVar[int]
    EXEC_FIELD_NUMBER: _ClassVar[int]
    GET_MESSAGES_FIELD_NUMBER: _ClassVar[int]
    GET_BOX_STATE_FIELD_NUMBER: _ClassVar[int]
    request_id: str
    list_files: ListFilesResult
    read_file: ReadFileResult
    exec: ExecResult
    get_messages: GetMessagesResult
    get_box_state: GetBoxStateResult
    def __init__(self, request_id: _Optional[str] = ..., list_files: _Optional[_Union[ListFilesResult, _Mapping]] = ..., read_file: _Optional[_Union[ReadFileResult, _Mapping]] = ..., exec: _Optional[_Union[ExecResult, _Mapping]] = ..., get_messages: _Optional[_Union[GetMessagesResult, _Mapping]] = ..., get_box_state: _Optional[_Union[GetBoxStateResult, _Mapping]] = ...) -> None: ...

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

class GetMessagesResult(_message.Message):
    __slots__ = ("messages",)
    MESSAGES_FIELD_NUMBER: _ClassVar[int]
    messages: _containers.RepeatedCompositeFieldContainer[ChatMessage]
    def __init__(self, messages: _Optional[_Iterable[_Union[ChatMessage, _Mapping]]] = ...) -> None: ...

class GetBoxStateResult(_message.Message):
    __slots__ = ("activity", "task_outcome", "task_outcome_message")
    ACTIVITY_FIELD_NUMBER: _ClassVar[int]
    TASK_OUTCOME_FIELD_NUMBER: _ClassVar[int]
    TASK_OUTCOME_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    activity: str
    task_outcome: str
    task_outcome_message: str
    def __init__(self, activity: _Optional[str] = ..., task_outcome: _Optional[str] = ..., task_outcome_message: _Optional[str] = ...) -> None: ...

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
    __slots__ = ("content",)
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    content: str
    def __init__(self, content: _Optional[str] = ...) -> None: ...

class CancelTask(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class Query(_message.Message):
    __slots__ = ("request_id", "list_files", "read_file", "exec", "get_messages", "get_box_state")
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    LIST_FILES_FIELD_NUMBER: _ClassVar[int]
    READ_FILE_FIELD_NUMBER: _ClassVar[int]
    EXEC_FIELD_NUMBER: _ClassVar[int]
    GET_MESSAGES_FIELD_NUMBER: _ClassVar[int]
    GET_BOX_STATE_FIELD_NUMBER: _ClassVar[int]
    request_id: str
    list_files: ListFilesQuery
    read_file: ReadFileQuery
    exec: ExecQuery
    get_messages: GetMessagesQuery
    get_box_state: GetBoxStateQuery
    def __init__(self, request_id: _Optional[str] = ..., list_files: _Optional[_Union[ListFilesQuery, _Mapping]] = ..., read_file: _Optional[_Union[ReadFileQuery, _Mapping]] = ..., exec: _Optional[_Union[ExecQuery, _Mapping]] = ..., get_messages: _Optional[_Union[GetMessagesQuery, _Mapping]] = ..., get_box_state: _Optional[_Union[GetBoxStateQuery, _Mapping]] = ...) -> None: ...

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
    __slots__ = ("command",)
    COMMAND_FIELD_NUMBER: _ClassVar[int]
    command: str
    def __init__(self, command: _Optional[str] = ...) -> None: ...

class GetMessagesQuery(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetBoxStateQuery(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ChatMessage(_message.Message):
    __slots__ = ("role", "content", "tool_calls", "tool_call_id", "tool_name", "metadata_json")
    ROLE_FIELD_NUMBER: _ClassVar[int]
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALLS_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALL_ID_FIELD_NUMBER: _ClassVar[int]
    TOOL_NAME_FIELD_NUMBER: _ClassVar[int]
    METADATA_JSON_FIELD_NUMBER: _ClassVar[int]
    role: str
    content: str
    tool_calls: _containers.RepeatedCompositeFieldContainer[ToolCall]
    tool_call_id: str
    tool_name: str
    metadata_json: str
    def __init__(self, role: _Optional[str] = ..., content: _Optional[str] = ..., tool_calls: _Optional[_Iterable[_Union[ToolCall, _Mapping]]] = ..., tool_call_id: _Optional[str] = ..., tool_name: _Optional[str] = ..., metadata_json: _Optional[str] = ...) -> None: ...

class ToolCall(_message.Message):
    __slots__ = ("id", "name", "args_json")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    ARGS_JSON_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    args_json: str
    def __init__(self, id: _Optional[str] = ..., name: _Optional[str] = ..., args_json: _Optional[str] = ...) -> None: ...
