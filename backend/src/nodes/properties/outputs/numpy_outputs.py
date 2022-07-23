import numpy as np

from ...utils.image_utils import preview_encode
from ...utils.utils import get_h_w_c
from .base_output import BaseOutput
from .. import expression


class NumPyOutput(BaseOutput):
    """Output a NumPy array"""

    def __init__(
        self,
        output_type: expression.ExpressionJson,
        label: str,
        kind: str = "generic",
        has_handle: bool = True,
    ):
        super().__init__(output_type, label, kind=kind, has_handle=has_handle)


def AudioOutput():
    """Output a 1D Audio NumPy array"""
    return NumPyOutput("Audio", "Audio")


class ImageOutput(NumPyOutput):
    def __init__(
        self,
        label: str = "Image",
        image_type: expression.ExpressionJson = "Image",
        kind: str = "image",
        has_handle: bool = True,
    ):
        super().__init__(
            expression.intersect(image_type, "Image"),
            label,
            kind=kind,
            has_handle=has_handle,
        )

    # Maybe someday we'll bring this back, but not today.
    def get_broadcast_data(self, _value: np.ndarray):
        return None


class LargeImageOutput(ImageOutput):
    def __init__(
        self,
        label: str = "Image",
        image_type: expression.ExpressionJson = "Image",
        kind: str = "large-image",
        has_handle: bool = True,
    ):
        super().__init__(
            label,
            expression.intersect(image_type, "Image"),
            kind=kind,
            has_handle=has_handle,
        )

    def get_broadcast_data(self, value: np.ndarray):
        img = value
        h, w, c = get_h_w_c(img)

        base64_img = preview_encode(img, 512)

        return {
            "image": base64_img,
            "height": h,
            "width": w,
            "channels": c,
        }


def VideoOutput():
    """Output a 3D Video NumPy array"""
    return NumPyOutput("Video", "Video")
