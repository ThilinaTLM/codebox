from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class SandboxEvent(_message.Message):
    __slots__ = ("register", "token", "model_start", "tool_start", "tool_end", "message_complete", "done", "error", "exec_output", "exec_done", "list_files_result", "read_file_result", "activity_changed", "task_outcome", "tool_exec_output", "thinking_token")
    REGISTER_FIELD_NUMBER: _ClassVar[int]
    TOKEN_FIELD_NUMBER: _ClassVar[int]
    MODEL_START_FIELD_NUMBER: _ClassVar[int]
    TOOL_START_FIELD_NUMBER: _ClassVar[int]
    TOOL_END_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_COMPLETE_FIELD_NUMBER: _ClassVar[int]
    DONE_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    EXEC_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    EXEC_DONE_FIELD_NUMBER: _ClassVar[int]
    LIST_FILES_RESULT_FIELD_NUMBER: _ClassVar[int]
    READ_FILE_RESULT_FIELD_NUMBER: _ClassVar[int]
    ACTIVITY_CHANGED_FIELD_NUMBER: _ClassVar[int]
    TASK_OUTCOME_FIELD_NUMBER: _ClassVar[int]
    TOOL_EXEC_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    THINKING_TOKEN_FIELD_NUMBER: _ClassVar[int]
    register: RegisterEvent
    token: TokenEvent
    model_start: ModelStartEvent
    tool_start: ToolStartEvent
    tool_end: ToolEndEvent
    message_complete: MessageCompleteEvent
    done: DoneEvent
    error: ErrorEvent
    exec_output: ExecOutputEvent
    exec_done: ExecDoneEvent
    list_files_result: ListFilesResultEvent
    read_file_result: ReadFileResultEvent
    activity_changed: ActivityChangedEvent
    task_outcome: TaskOutcomeEvent
    tool_exec_output: ToolExecOutputEvent
    thinking_token: ThinkingTokenEvent
    def __init__(self, register: _Optional[_Union[RegisterEvent, _Mapping]] = ..., token: _Optional[_Union[TokenEvent, _Mapping]] = ..., model_start: _Optional[_Union[ModelStartEvent, _Mapping]] = ..., tool_start: _Optional[_Union[ToolStartEvent, _Mapping]] = ..., tool_end: _Optional[_Union[ToolEndEvent, _Mapping]] = ..., message_complete: _Optional[_Union[MessageCompleteEvent, _Mapping]] = ..., done: _Optional[_Union[DoneEvent, _Mapping]] = ..., error: _Optional[_Union[ErrorEvent, _Mapping]] = ..., exec_output: _Optional[_Union[ExecOutputEvent, _Mapping]] = ..., exec_done: _Optional[_Union[ExecDoneEvent, _Mapping]] = ..., list_files_result: _Optional[_Union[ListFilesResultEvent, _Mapping]] = ..., read_file_result: _Optional[_Union[ReadFileResultEvent, _Mapping]] = ..., activity_changed: _Optional[_Union[ActivityChangedEvent, _Mapping]] = ..., task_outcome: _Optional[_Union[TaskOutcomeEvent, _Mapping]] = ..., tool_exec_output: _Optional[_Union[ToolExecOutputEvent, _Mapping]] = ..., thinking_token: _Optional[_Union[ThinkingTokenEvent, _Mapping]] = ...) -> None: ...

class RegisterEvent(_message.Message):
    __slots__ = ("session_id",)
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    session_id: str
    def __init__(self, session_id: _Optional[str] = ...) -> None: ...

class TokenEvent(_message.Message):
    __slots__ = ("text",)
    TEXT_FIELD_NUMBER: _ClassVar[int]
    text: str
    def __init__(self, text: _Optional[str] = ...) -> None: ...

class ModelStartEvent(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ToolStartEvent(_message.Message):
    __slots__ = ("name", "tool_call_id", "input")
    NAME_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALL_ID_FIELD_NUMBER: _ClassVar[int]
    INPUT_FIELD_NUMBER: _ClassVar[int]
    name: str
    tool_call_id: str
    input: str
    def __init__(self, name: _Optional[str] = ..., tool_call_id: _Optional[str] = ..., input: _Optional[str] = ...) -> None: ...

class ToolEndEvent(_message.Message):
    __slots__ = ("name", "output")
    NAME_FIELD_NUMBER: _ClassVar[int]
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    name: str
    output: str
    def __init__(self, name: _Optional[str] = ..., output: _Optional[str] = ...) -> None: ...

class MessageCompleteEvent(_message.Message):
    __slots__ = ("message",)
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    message: ChatMessage
    def __init__(self, message: _Optional[_Union[ChatMessage, _Mapping]] = ...) -> None: ...

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

class ExecOutputEvent(_message.Message):
    __slots__ = ("output", "request_id")
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    output: str
    request_id: str
    def __init__(self, output: _Optional[str] = ..., request_id: _Optional[str] = ...) -> None: ...

class ExecDoneEvent(_message.Message):
    __slots__ = ("output", "request_id")
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    output: str
    request_id: str
    def __init__(self, output: _Optional[str] = ..., request_id: _Optional[str] = ...) -> None: ...

class ListFilesResultEvent(_message.Message):
    __slots__ = ("request_id", "data_json", "error")
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    DATA_JSON_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    request_id: str
    data_json: str
    error: str
    def __init__(self, request_id: _Optional[str] = ..., data_json: _Optional[str] = ..., error: _Optional[str] = ...) -> None: ...

class ReadFileResultEvent(_message.Message):
    __slots__ = ("request_id", "data_json", "error")
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    DATA_JSON_FIELD_NUMBER: _ClassVar[int]
    ERROR_FIELD_NUMBER: _ClassVar[int]
    request_id: str
    data_json: str
    error: str
    def __init__(self, request_id: _Optional[str] = ..., data_json: _Optional[str] = ..., error: _Optional[str] = ...) -> None: ...

class ActivityChangedEvent(_message.Message):
    __slots__ = ("status",)
    STATUS_FIELD_NUMBER: _ClassVar[int]
    status: str
    def __init__(self, status: _Optional[str] = ...) -> None: ...

class TaskOutcomeEvent(_message.Message):
    __slots__ = ("status", "message")
    STATUS_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    status: str
    message: str
    def __init__(self, status: _Optional[str] = ..., message: _Optional[str] = ...) -> None: ...

class ToolExecOutputEvent(_message.Message):
    __slots__ = ("output", "tool_call_id")
    OUTPUT_FIELD_NUMBER: _ClassVar[int]
    TOOL_CALL_ID_FIELD_NUMBER: _ClassVar[int]
    output: str
    tool_call_id: str
    def __init__(self, output: _Optional[str] = ..., tool_call_id: _Optional[str] = ...) -> None: ...

class ThinkingTokenEvent(_message.Message):
    __slots__ = ("text",)
    TEXT_FIELD_NUMBER: _ClassVar[int]
    text: str
    def __init__(self, text: _Optional[str] = ...) -> None: ...

class OrchestratorCommand(_message.Message):
    __slots__ = ("registered", "message", "exec", "cancel", "thread_restore", "list_files", "read_file")
    REGISTERED_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    EXEC_FIELD_NUMBER: _ClassVar[int]
    CANCEL_FIELD_NUMBER: _ClassVar[int]
    THREAD_RESTORE_FIELD_NUMBER: _ClassVar[int]
    LIST_FILES_FIELD_NUMBER: _ClassVar[int]
    READ_FILE_FIELD_NUMBER: _ClassVar[int]
    registered: RegisteredCommand
    message: SendMessageCommand
    exec: ExecCommand
    cancel: CancelCommand
    thread_restore: ThreadRestoreCommand
    list_files: ListFilesCommand
    read_file: ReadFileCommand
    def __init__(self, registered: _Optional[_Union[RegisteredCommand, _Mapping]] = ..., message: _Optional[_Union[SendMessageCommand, _Mapping]] = ..., exec: _Optional[_Union[ExecCommand, _Mapping]] = ..., cancel: _Optional[_Union[CancelCommand, _Mapping]] = ..., thread_restore: _Optional[_Union[ThreadRestoreCommand, _Mapping]] = ..., list_files: _Optional[_Union[ListFilesCommand, _Mapping]] = ..., read_file: _Optional[_Union[ReadFileCommand, _Mapping]] = ...) -> None: ...

class RegisteredCommand(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class SendMessageCommand(_message.Message):
    __slots__ = ("content",)
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    content: str
    def __init__(self, content: _Optional[str] = ...) -> None: ...

class ExecCommand(_message.Message):
    __slots__ = ("content", "request_id")
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    content: str
    request_id: str
    def __init__(self, content: _Optional[str] = ..., request_id: _Optional[str] = ...) -> None: ...

class CancelCommand(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ThreadRestoreCommand(_message.Message):
    __slots__ = ("messages",)
    MESSAGES_FIELD_NUMBER: _ClassVar[int]
    messages: _containers.RepeatedCompositeFieldContainer[ChatMessage]
    def __init__(self, messages: _Optional[_Iterable[_Union[ChatMessage, _Mapping]]] = ...) -> None: ...

class ListFilesCommand(_message.Message):
    __slots__ = ("path", "request_id")
    PATH_FIELD_NUMBER: _ClassVar[int]
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    path: str
    request_id: str
    def __init__(self, path: _Optional[str] = ..., request_id: _Optional[str] = ...) -> None: ...

class ReadFileCommand(_message.Message):
    __slots__ = ("path", "request_id")
    PATH_FIELD_NUMBER: _ClassVar[int]
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    path: str
    request_id: str
    def __init__(self, path: _Optional[str] = ..., request_id: _Optional[str] = ...) -> None: ...

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
