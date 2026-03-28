"""GitHub integration exceptions."""


class InvalidWebhookSignature(Exception):
    pass


class InstallationNotFound(Exception):
    def __init__(self, installation_id: int | str) -> None:
        super().__init__(f"GitHub installation not found: {installation_id}")
