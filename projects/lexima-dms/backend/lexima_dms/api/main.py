from __future__ import annotations

from fastapi import FastAPI

from lexima_dms.api.routes import auth, documents, tasks


app = FastAPI(title="DIGITAL DOCUMENTS MVP", version="0.1.0")

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(tasks.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

