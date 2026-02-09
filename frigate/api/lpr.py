"""License Plate Recognition (LPR) monitoring APIs."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Request
from fastapi.params import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from frigate.api.auth import require_role
from frigate.api.defs.tags import Tags

logger = logging.getLogger(__name__)

router = APIRouter(tags=[Tags.app])


class PlateListBody(BaseModel):
    plates: List[str] = Field(title="List of license plate patterns (strings or regex)")


class PlateListUpdateBody(BaseModel):
    plate: str = Field(title="License plate pattern to add or remove")


class GenericResponse(BaseModel):
    success: bool
    message: str


@router.get(
    "/lpr/plates/whitelist",
    dependencies=[Depends(require_role(["admin"]))],
    summary="Get the current whitelist of license plates",
)
def get_whitelist(request: Request):
    config = request.app.frigate_config
    return JSONResponse(
        content={
            "success": True,
            "whitelist": config.lpr.whitelist,
        }
    )


@router.get(
    "/lpr/plates/blacklist",
    dependencies=[Depends(require_role(["admin"]))],
    summary="Get the current blacklist of license plates",
)
def get_blacklist(request: Request):
    config = request.app.frigate_config
    return JSONResponse(
        content={
            "success": True,
            "blacklist": config.lpr.blacklist,
        }
    )


@router.put(
    "/lpr/plates/whitelist",
    response_model=GenericResponse,
    dependencies=[Depends(require_role(["admin"]))],
    summary="Set the entire whitelist of license plates",
)
def set_whitelist(request: Request, body: PlateListBody):
    config = request.app.frigate_config
    config.lpr.whitelist = body.plates
    return JSONResponse(
        content={
            "success": True,
            "message": f"Whitelist updated with {len(body.plates)} plates.",
        }
    )


@router.put(
    "/lpr/plates/blacklist",
    response_model=GenericResponse,
    dependencies=[Depends(require_role(["admin"]))],
    summary="Set the entire blacklist of license plates",
)
def set_blacklist(request: Request, body: PlateListBody):
    config = request.app.frigate_config
    config.lpr.blacklist = body.plates
    return JSONResponse(
        content={
            "success": True,
            "message": f"Blacklist updated with {len(body.plates)} plates.",
        }
    )


@router.post(
    "/lpr/plates/whitelist",
    response_model=GenericResponse,
    dependencies=[Depends(require_role(["admin"]))],
    summary="Add a plate to the whitelist",
)
def add_to_whitelist(request: Request, body: PlateListUpdateBody):
    config = request.app.frigate_config
    if body.plate not in config.lpr.whitelist:
        config.lpr.whitelist.append(body.plate)
    return JSONResponse(
        content={
            "success": True,
            "message": f"Plate '{body.plate}' added to whitelist.",
        }
    )


@router.post(
    "/lpr/plates/blacklist",
    response_model=GenericResponse,
    dependencies=[Depends(require_role(["admin"]))],
    summary="Add a plate to the blacklist",
)
def add_to_blacklist(request: Request, body: PlateListUpdateBody):
    config = request.app.frigate_config
    if body.plate not in config.lpr.blacklist:
        config.lpr.blacklist.append(body.plate)
    return JSONResponse(
        content={
            "success": True,
            "message": f"Plate '{body.plate}' added to blacklist.",
        }
    )


@router.delete(
    "/lpr/plates/whitelist",
    response_model=GenericResponse,
    dependencies=[Depends(require_role(["admin"]))],
    summary="Remove a plate from the whitelist",
)
def remove_from_whitelist(request: Request, body: PlateListUpdateBody):
    config = request.app.frigate_config
    if body.plate in config.lpr.whitelist:
        config.lpr.whitelist.remove(body.plate)
        return JSONResponse(
            content={
                "success": True,
                "message": f"Plate '{body.plate}' removed from whitelist.",
            }
        )
    return JSONResponse(
        content={
            "success": False,
            "message": f"Plate '{body.plate}' not found in whitelist.",
        },
        status_code=404,
    )


@router.delete(
    "/lpr/plates/blacklist",
    response_model=GenericResponse,
    dependencies=[Depends(require_role(["admin"]))],
    summary="Remove a plate from the blacklist",
)
def remove_from_blacklist(request: Request, body: PlateListUpdateBody):
    config = request.app.frigate_config
    if body.plate in config.lpr.blacklist:
        config.lpr.blacklist.remove(body.plate)
        return JSONResponse(
            content={
                "success": True,
                "message": f"Plate '{body.plate}' removed from blacklist.",
            }
        )
    return JSONResponse(
        content={
            "success": False,
            "message": f"Plate '{body.plate}' not found in blacklist.",
        },
        status_code=404,
    )


@router.get(
    "/lpr/plates/lists",
    dependencies=[Depends(require_role(["admin"]))],
    summary="Get both whitelist and blacklist",
)
def get_plate_lists(request: Request):
    config = request.app.frigate_config
    return JSONResponse(
        content={
            "success": True,
            "whitelist": config.lpr.whitelist,
            "blacklist": config.lpr.blacklist,
            "alert_on_unknown": config.lpr.alert_on_unknown,
        }
    )
