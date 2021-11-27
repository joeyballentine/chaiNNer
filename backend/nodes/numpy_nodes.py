"""
Nodes that provide functionality for numpy array manipulation
"""

from typing import List

import cv2
import numpy as np
from sanic.log import logger

from .node_base import NodeBase
from .node_factory import NodeFactory
from .properties.inputs.generic_inputs import SliderInput
from .properties.inputs.numpy_inputs import ImageInput
from .properties.outputs.numpy_outputs import ImageOutput


@NodeFactory.register("NumPy", "Img::Channel::Split")
class ChannelSplitRGBANode(NodeBase):
    """NumPy  Splitter node"""

    def __init__(self):
        """Constructor"""
        self.description = "Split numpy image channels into separate channels. Typically used for splitting off an alpha (transparency) layer."
        self.inputs = [ImageInput()]
        self.outputs = [
            ImageOutput("Channel A"),
            ImageOutput("Channel B"),
            ImageOutput("Channel C"),
            ImageOutput("Channel D"),
        ]

    def run(self, img: np.ndarray) -> np.ndarray:
        """Split a multi-chanel image into separate channels"""
        c = 1
        if img.ndim > 2:
            c = img.shape[2]
            safe_out = np.zeros_like(img[:, :, 0])
        else:
            safe_out = np.zeros_like(img)

        out = []
        for i in range(c):
            out.append(img[:, :, i])
        for i in range(4 - c):
            out.append(safe_out)

        return out


@NodeFactory.register("NumPy", "Img::Channel::Merge")
class ChannelMergeRGBANode(NodeBase):
    """NumPy Merger node"""

    def __init__(self):
        """Constructor"""
        self.description = "Merge numpy channels together into a <= 4 channel image. Typically used for combining an image with an alpha layer."
        self.inputs = [
            ImageInput("Channel(s) A"),
            ImageInput("Channel(s) B"),
            ImageInput("Channel(s) C"),
            ImageInput("Channel(s) D"),
        ]
        self.outputs = [ImageOutput()]

    def run(
        self,
        im1: np.ndarray,
        im2: np.ndarray = None,
        im3: np.ndarray = None,
        im4: np.ndarray = None,
    ) -> np.ndarray:
        """Combine separate channels into a multi-chanel image"""

        # assert im1.shape[:2] == im2.shape[:2] == im3.shape[:2] == im4.shape[:2]

        imgs = []
        for img in im1, im2, im3, im4:
            if img is not None:
                imgs.append(img)

        for idx, img in enumerate(imgs):
            if img.ndim == 2:
                imgs[idx] = np.expand_dims(img, axis=2)

        img = np.concatenate(imgs, axis=2)

        # ensure output is safe number of channels
        if img.ndim > 2:
            h, w, c = img.shape
            if c == 2:
                b, g = cv2.split(img)
                img = cv2.merge((b, g, g))
            if c > 4:
                img = img[:, :, :4]

        return img
