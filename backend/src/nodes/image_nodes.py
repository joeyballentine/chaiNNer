"""
Nodes that provide functionality for opencv image manipulation
"""

from __future__ import annotations

import os
import platform
import subprocess
import time
from tempfile import mkdtemp

import cv2
import numpy as np
from PIL import Image
from sanic.log import logger

from .categories import IMAGE
from .node_base import NodeBase
from .node_factory import NodeFactory
from .properties.inputs import *
from .properties.outputs import *
from .utils.image_utils import (
    get_opencv_formats,
    get_pil_formats,
    normalize,
    preview_encode,
)
from .utils.pil_utils import *
from .utils.utils import get_h_w_c


@NodeFactory.register("chainner:image:load")
class ImReadNode(NodeBase):
    def __init__(self):
        super().__init__()
        self.description = "Load image from file."
        self.inputs = [ImageFileInput()]
        self.outputs = [
            LargeImageOutput(),
            DirectoryOutput(),
            TextOutput("Image Name"),
        ]

        self.category = IMAGE
        self.name = "Load Image"
        self.icon = "BsFillImageFill"
        self.sub = "Input & Output"
        self.result = None

    def run(self, path: str) -> Tuple[np.ndarray, str, str]:
        """Reads an image from the specified path and return it as a numpy array"""

        logger.info(f"Reading image from path: {path}")
        _base, ext = os.path.splitext(path)
        if ext.lower() in get_opencv_formats():
            try:
                img = cv2.imdecode(
                    np.fromfile(path, dtype=np.uint8), cv2.IMREAD_UNCHANGED
                )
            except:
                logger.warning(f"Error loading image, trying with imread.")
                try:
                    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
                except Exception as e:
                    logger.error("Error loading image.")
                    raise RuntimeError(
                        f'Error reading image image from path "{path}". Image may be corrupt.'
                    ) from e
        elif ext.lower() in get_pil_formats():
            im = Image.open(path)
            img = np.array(im)
            _, _, c = get_h_w_c(img)
            if c == 3:
                img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            elif c == 4:
                img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGRA)
        else:
            raise NotImplementedError(
                "The image you are trying to read cannot be read by chaiNNer."
            )

        # Uncomment if wild 2-channel image is encountered
        # self.shape = img.shape
        # if img.shape[2] == 2:
        #     color_channel = img[:, :, 0]
        #     alpha_channel = img[:, :, 1]
        #     img = np.dstack(color_channel, color_channel, color_channel, alpha_channel)

        img = normalize(img)

        dirname, basename = os.path.split(os.path.splitext(path)[0])
        self.result = (img, dirname, basename)
        return self.result


@NodeFactory.register("chainner:image:save")
class ImWriteNode(NodeBase):
    def __init__(self):
        super().__init__()
        self.description = "Save image to file at a specified directory."
        self.inputs = [
            ImageInput(),
            DirectoryInput(has_handle=True),
            TextInput("Relative Path").make_optional(),
            TextInput("Image Name"),
            ImageExtensionDropdown(),
        ]
        self.category = IMAGE
        self.name = "Save Image"
        self.outputs = []
        self.icon = "MdSave"
        self.sub = "Input & Output"

        self.side_effects = True

    def run(
        self,
        img: np.ndarray,
        base_directory: str,
        relative_path: Union[str, None],
        filename: str,
        extension: str,
    ) -> bool:
        """Write an image to the specified path and return write status"""

        full_file = f"{filename}.{extension}"
        if relative_path and relative_path != ".":
            base_directory = os.path.join(base_directory, relative_path)
        full_path = os.path.join(base_directory, full_file)

        logger.info(f"Writing image to path: {full_path}")

        # Put image back in int range
        img = (np.clip(img, 0, 1) * 255).round().astype("uint8")

        os.makedirs(base_directory, exist_ok=True)

        status, buf_img = cv2.imencode(f".{extension}", img)
        with open(full_path, "wb") as outf:
            bytes_written = outf.write(buf_img)
            status = status and bytes_written == len(buf_img)

        return status


@NodeFactory.register("chainner:image:preview")
class ImOpenNode(NodeBase):
    def __init__(self):
        super().__init__()
        self.description = "Open the image in your default image viewer."
        self.inputs = [ImageInput()]
        self.outputs = []
        self.category = IMAGE
        self.name = "View Image (external)"
        self.icon = "BsEyeFill"
        self.sub = "Input & Output"

        self.side_effects = True

    def run(self, img: np.ndarray):
        """Show image"""

        # Put image back in int range
        img = (np.clip(img, 0, 1) * 255).round().astype("uint8")

        tempdir = mkdtemp(prefix="chaiNNer-")
        logger.info(f"Writing image to temp path: {tempdir}")
        im_name = f"{time.time()}.png"
        temp_save_dir = os.path.join(tempdir, im_name)
        status = cv2.imwrite(
            temp_save_dir,
            img,
        )

        if status:
            if platform.system() == "Darwin":  # macOS
                subprocess.call(("open", temp_save_dir))  # type: ignore
            elif platform.system() == "Windows":  # Windows
                os.startfile(temp_save_dir)  # type: ignore
            else:  # linux variants
                subprocess.call(("xdg-open", temp_save_dir))  # type: ignore


@NodeFactory.register("chainner:image:view")
class ImViewNode(NodeBase):
    def __init__(self):
        super().__init__()
        self.description = "See an inline preview of the image in the editor."
        self.inputs = [ImageInput()]
        self.outputs = [
            LargeImageOutput("Preview", image_type="Input0", has_handle=False)
        ]
        self.category = IMAGE
        self.name = "View Image"
        self.icon = "BsEyeFill"
        self.sub = "Input & Output"

        self.side_effects = True

    def run(self, img: np.ndarray):
        return img
