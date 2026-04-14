from fastapi import APIRouter, HTTPException

from app.database import neo4j_driver
from app.models import GraphData, GraphNode, GraphLink, NodeDetail

router = APIRouter()


@router.get("/graph", response_model=GraphData)
async def get_graph(limit: int = 200):
    try:
        query = """
        MATCH (n)-[r]->(m)
        RETURN n, type(r) AS rel_type, m
        LIMIT $limit
        """
        records = neo4j_driver.execute_query(query, {"limit": limit})
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库连接失败: {str(e)}")

    nodes_map: dict[str, GraphNode] = {}
    links: list[GraphLink] = []

    for record in records:
        n = record["n"]
        m = record["m"]
        rel_type = record["rel_type"]

        n_id = str(n.element_id) if hasattr(n, "element_id") else str(n.id)
        m_id = str(m.element_id) if hasattr(m, "element_id") else str(m.id)

        n_labels = list(n.labels) if hasattr(n, "labels") else ["Unknown"]
        m_labels = list(m.labels) if hasattr(m, "labels") else ["Unknown"]

        if n_id not in nodes_map:
            nodes_map[n_id] = GraphNode(
                id=n_id,
                name=n.get("name", n_id),
                label=n_labels[0] if n_labels else "Unknown",
                val=n.get("val", 1),
                properties=dict(n),
            )

        if m_id not in nodes_map:
            nodes_map[m_id] = GraphNode(
                id=m_id,
                name=m.get("name", m_id),
                label=m_labels[0] if m_labels else "Unknown",
                val=m.get("val", 1),
                properties=dict(m),
            )

        links.append(
            GraphLink(
                source=n_id,
                target=m_id,
                label=rel_type,
            )
        )

    return GraphData(nodes=list(nodes_map.values()), links=links)


@router.get("/node/{node_id}", response_model=NodeDetail)
async def get_node_detail(node_id: str):
    try:
        query = """
        MATCH (n)
        WHERE elementId(n) = $node_id OR n.id = $node_id OR n.name = $node_id
        OPTIONAL MATCH (n)-[r]-(m)
        RETURN n, collect({type: type(r), target: m.name, target_label: labels(m)[0]}) AS rels
        LIMIT 1
        """
        records = neo4j_driver.execute_query(query, {"node_id": node_id})
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库连接失败: {str(e)}")

    if not records:
        raise HTTPException(status_code=404, detail=f"节点 '{node_id}' 未找到")

    record = records[0]
    n = record["n"]
    rels = record["rels"]

    n_id = str(n.element_id) if hasattr(n, "element_id") else str(n.id)
    n_labels = list(n.labels) if hasattr(n, "labels") else ["Unknown"]

    relationships = [
        {
            "type": rel["type"],
            "target": rel["target"],
            "target_label": rel["target_label"],
        }
        for rel in rels
        if rel["target"] is not None
    ]

    return NodeDetail(
        id=n_id,
        name=n.get("name", n_id),
        label=n_labels[0] if n_labels else "Unknown",
        properties=dict(n),
        relationships=relationships,
    )


@router.get("/search")
async def search_nodes(q: str, limit: int = 20):
    try:
        query = """
        MATCH (n)
        WHERE n.name CONTAINS $q OR any(prop IN keys(n) WHERE toString(n[prop]) CONTAINS $q)
        RETURN n
        LIMIT $limit
        """
        records = neo4j_driver.execute_query(query, {"q": q, "limit": limit})
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"数据库连接失败: {str(e)}")

    results = []
    for record in records:
        n = record["n"]
        n_id = str(n.element_id) if hasattr(n, "element_id") else str(n.id)
        n_labels = list(n.labels) if hasattr(n, "labels") else ["Unknown"]
        results.append(
            {
                "id": n_id,
                "name": n.get("name", n_id),
                "label": n_labels[0] if n_labels else "Unknown",
            }
        )

    return {"results": results, "count": len(results)}


@router.post("/seed")
async def seed_demo_data():
    node_statements = [
        "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Concept) REQUIRE n.id IS UNIQUE",
        "MERGE (:Concept {id: 'n1', name: '人工智能', val: 10, description: '计算机科学的一个分支'})",
        "MERGE (:Technology {id: 'n2', name: '机器学习', val: 8, description: 'AI的核心子领域'})",
        "MERGE (:Technology {id: 'n3', name: '深度学习', val: 7, description: '基于神经网络的ML'})",
        "MERGE (:Technology {id: 'n4', name: '自然语言处理', val: 6, description: '理解和生成人类语言'})",
        "MERGE (:Technology {id: 'n5', name: '计算机视觉', val: 6, description: '使机器理解图像和视频'})",
        "MERGE (:Technology {id: 'n6', name: 'Transformer', val: 9, description: '基于注意力机制的架构'})",
        "MERGE (:Product {id: 'n7', name: 'GPT', val: 8, description: '生成式预训练模型'})",
        "MERGE (:Product {id: 'n8', name: 'BERT', val: 7, description: '双向编码器表示'})",
        "MERGE (:Technology {id: 'n9', name: '卷积神经网络', val: 5, description: 'CNN，用于图像处理'})",
        "MERGE (:Organization {id: 'n10', name: 'OpenAI', val: 8, description: 'AI研究公司'})",
        "MERGE (:Organization {id: 'n11', name: 'Google', val: 7, description: '科技巨头'})",
        "MERGE (:Person {id: 'n12', name: 'Geoffrey Hinton', val: 5, description: '深度学习之父'})",
        "MERGE (:Technology {id: 'n13', name: '强化学习', val: 5, description: '通过奖励信号学习'})",
        "MERGE (:Concept {id: 'n14', name: '知识图谱', val: 6, description: '结构化的知识表示'})",
        "MERGE (:Technology {id: 'n15', name: '图神经网络', val: 5, description: '处理图结构数据的NN'})",
        "MERGE (:Product {id: 'n16', name: 'MediaPipe', val: 4, description: 'Google开源的ML框架'})",
        "MERGE (:Technology {id: 'n17', name: '手势识别', val: 4, description: '通过摄像头识别手势'})",
        "MERGE (:Product {id: 'n18', name: 'Neo4j', val: 5, description: '图数据库'})",
        "MERGE (:Product {id: 'n19', name: 'FastAPI', val: 4, description: 'Python异步Web框架'})",
        "MERGE (:Technology {id: 'n20', name: 'WebGL', val: 3, description: '浏览器3D图形API'})",
    ]

    rel_statements = [
        "MATCH (a {id: 'n1'}), (b {id: 'n2'}) MERGE (a)-[:包含]->(b)",
        "MATCH (a {id: 'n1'}), (b {id: 'n4'}) MERGE (a)-[:包含]->(b)",
        "MATCH (a {id: 'n1'}), (b {id: 'n5'}) MERGE (a)-[:包含]->(b)",
        "MATCH (a {id: 'n1'}), (b {id: 'n13'}) MERGE (a)-[:包含]->(b)",
        "MATCH (a {id: 'n2'}), (b {id: 'n3'}) MERGE (a)-[:子领域]->(b)",
        "MATCH (a {id: 'n2'}), (b {id: 'n13'}) MERGE (a)-[:子领域]->(b)",
        "MATCH (a {id: 'n3'}), (b {id: 'n6'}) MERGE (a)-[:催生]->(b)",
        "MATCH (a {id: 'n3'}), (b {id: 'n9'}) MERGE (a)-[:包含]->(b)",
        "MATCH (a {id: 'n3'}), (b {id: 'n15'}) MERGE (a)-[:延伸]->(b)",
        "MATCH (a {id: 'n4'}), (b {id: 'n6'}) MERGE (a)-[:依赖]->(b)",
        "MATCH (a {id: 'n4'}), (b {id: 'n8'}) MERGE (a)-[:应用]->(b)",
        "MATCH (a {id: 'n5'}), (b {id: 'n9'}) MERGE (a)-[:依赖]->(b)",
        "MATCH (a {id: 'n5'}), (b {id: 'n16'}) MERGE (a)-[:应用]->(b)",
        "MATCH (a {id: 'n6'}), (b {id: 'n7'}) MERGE (a)-[:架构]->(b)",
        "MATCH (a {id: 'n6'}), (b {id: 'n8'}) MERGE (a)-[:架构]->(b)",
        "MATCH (a {id: 'n7'}), (b {id: 'n10'}) MERGE (a)-[:开发]->(b)",
        "MATCH (a {id: 'n8'}), (b {id: 'n11'}) MERGE (a)-[:开发]->(b)",
        "MATCH (a {id: 'n9'}), (b {id: 'n12'}) MERGE (a)-[:先驱]->(b)",
        "MATCH (a {id: 'n10'}), (b {id: 'n7'}) MERGE (a)-[:产品]->(b)",
        "MATCH (a {id: 'n11'}), (b {id: 'n16'}) MERGE (a)-[:开发]->(b)",
        "MATCH (a {id: 'n12'}), (b {id: 'n3'}) MERGE (a)-[:贡献]->(b)",
        "MATCH (a {id: 'n14'}), (b {id: 'n15'}) MERGE (a)-[:驱动]->(b)",
        "MATCH (a {id: 'n14'}), (b {id: 'n18'}) MERGE (a)-[:存储]->(b)",
        "MATCH (a {id: 'n16'}), (b {id: 'n17'}) MERGE (a)-[:支持]->(b)",
        "MATCH (a {id: 'n17'}), (b {id: 'n5'}) MERGE (a)-[:属于]->(b)",
        "MATCH (a {id: 'n18'}), (b {id: 'n19'}) MERGE (a)-[:配合]->(b)",
        "MATCH (a {id: 'n20'}), (b {id: 'n5'}) MERGE (a)-[:支撑]->(b)",
    ]

    try:
        for stmt in node_statements:
            neo4j_driver.execute_query(stmt)
        for stmt in rel_statements:
            neo4j_driver.execute_query(stmt)
        return {"status": "ok", "message": "演示数据已导入", "nodes": 20, "relationships": 27}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据导入失败: {str(e)}")
