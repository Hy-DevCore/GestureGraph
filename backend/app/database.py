from neo4j import GraphDatabase
import os


NEO4J_URI = os.getenv("NEO4J_URI", "bolt://neo4j:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "gesturegraph2024")


class Neo4jDriver:
    def __init__(self):
        self._driver = None

    @property
    def driver(self):
        if self._driver is None:
            self._driver = GraphDatabase.driver(
                NEO4J_URI,
                auth=(NEO4J_USER, NEO4J_PASSWORD),
                max_connection_lifetime=3600,
                max_connection_pool_size=50,
                connection_acquisition_timeout=60,
            )
        return self._driver

    def get_session(self):
        return self.driver.session()

    def execute_query(self, query, parameters=None):
        with self.get_session() as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]

    def close(self):
        if self._driver is not None:
            self._driver.close()
            self._driver = None


neo4j_driver = Neo4jDriver()
