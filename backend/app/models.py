from pydantic import BaseModel
from typing import Any, Optional


class GraphNode(BaseModel):
    id: str
    name: str
    label: str
    val: Optional[float] = 1
    properties: Optional[dict[str, Any]] = None


class GraphLink(BaseModel):
    source: str
    target: str
    label: Optional[str] = None
    value: Optional[float] = 1


class GraphData(BaseModel):
    nodes: list[GraphNode]
    links: list[GraphLink]


class NodeDetail(BaseModel):
    id: str
    name: str
    label: str
    properties: Optional[dict[str, Any]] = None
    relationships: Optional[list[dict[str, Any]]] = None


class RelationshipInfo(BaseModel):
    type: str
    target: str
    target_label: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str
