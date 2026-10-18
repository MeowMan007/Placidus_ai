"""
API v1 route definitions.
"""
from fastapi import APIRouter

from app.main import app as main_app

# All routes are registered directly in main.py for simplicity
# This file exists for future route modularization

api_router = APIRouter(prefix="/api/v1")
