from abc import ABCMeta, abstractmethod
from typing import Any, List, Union

from .properties.inputs.base_input import BaseInput
from .properties.outputs.base_output import BaseOutput


def assign_implicit_ids(l: Union[List[BaseInput], List[BaseOutput]]):
    for i, inout in enumerate(l):
        if inout.id is None:
            inout.id = i


class NodeBase(metaclass=ABCMeta):
    """Base class for a node"""

    def __init__(self):
        self.inputs: List[BaseInput] = []
        self.outputs: List[BaseOutput] = []
        self.description = ""

        self.category = ""
        self.name = ""
        self.icon = ""
        self.sub = "Miscellaneous"
        self.type = "regularNode"

        self.side_effects = False
        self.deprecated = False

    @abstractmethod
    def run(self) -> Any:
        """Abstract method to run a node's logic"""
        return

    def get_extra_data(self) -> Any:
        """Abstract method for getting extra data the frontend needs"""
        return

    def get_inputs(self, with_implicit_ids=False):
        if with_implicit_ids:
            assign_implicit_ids(self.inputs)
        return self.inputs

    def get_outputs(self, with_implicit_ids=False):
        if with_implicit_ids:
            assign_implicit_ids(self.outputs)
        return self.outputs

    def get_description(self):
        return self.description

    def get_name(self):
        return self.name

    def get_category(self):
        return self.category

    def get_icon(self):
        return self.icon

    def get_sub_category(self):
        return self.sub

    def get_type(self):
        return self.type

    def get_has_side_effects(self):
        return self.side_effects

    def is_deprecated(self):
        return self.deprecated


# pylint: disable=abstract-method
class IteratorNodeBase(NodeBase):
    """Base class for an iterator node"""

    def __init__(self):
        super().__init__()
        self.icon = "MdLoop"
        self.sub = "Iteration"
        self.type = "iterator"
        self.default_nodes = []

        self.side_effects = True

    def get_default_nodes(self):
        return self.default_nodes
