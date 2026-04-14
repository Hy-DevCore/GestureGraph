from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import neo4j_driver
from app.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    neo4j_driver.close()


app = FastAPI(
    title="GestureGraph API",
    description="知识图谱手势交互展示系统后端API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "GestureGraph API"}
