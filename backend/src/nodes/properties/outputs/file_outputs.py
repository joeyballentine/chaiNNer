from __future__ import annotations
from .base_output import BaseOutput
from .. import expression


class FileOutput(BaseOutput):
    """Output for saving a local file"""

    def __init__(
        self, file_type: expression.ExpressionJson, label: str, kind: str = "generic"
    ):
        super().__init__(file_type, label, kind=kind)

    def get_broadcast_data(self, value: str):
        return value


def ImageFileOutput() -> FileOutput:
    """Output for saving a local image file"""
    return FileOutput("ImageFile", "Image File")


def DirectoryOutput() -> FileOutput:
    """Output for saving to a directory"""
    return FileOutput("Directory", "Image Directory", kind="directory")


def OnnxFileOutput() -> FileOutput:
    """Output for saving a .onnx file"""
    return FileOutput("OnnxFile", "ONNX Model File")
