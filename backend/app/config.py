"""
Loads JSON config files (roles, applications, security groups, etc.)
Everyone reads config through this module -- don't hardcode role/app
lists anywhere else.
"""
import json
import os

CONFIG_DIR = os.path.join(os.path.dirname(__file__), "config_data")


def _load(filename: str):
    with open(os.path.join(CONFIG_DIR, filename)) as f:
        return json.load(f)


def get_roles():
    return _load("roles.json")


def get_applications():
    return _load("applications.json")


def get_security_groups():
    return _load("security_groups.json")


def get_asset_templates():
    return _load("asset_templates.json")


def get_compliance_templates():
    return _load("compliance_templates.json")


def get_risk_factors():
    return _load("risk_factors.json")


def get_required_documents():
    return _load("required_documents.json")


def get_projects():
    return _load("projects.json")


def get_all_applications() -> list[str]:
    """Flattened, deduplicated list across every role -- the full catalog
    an approver can pick from when editing the Assign Applications task,
    not just what AI suggested for this specific role."""
    apps = get_applications()
    seen = []
    for role_apps in apps.values():
        for a in role_apps:
            if a not in seen:
                seen.append(a)
    return seen


def get_all_security_groups() -> list[str]:
    groups = get_security_groups()
    seen = []
    for role_groups in groups.values():
        for g in role_groups:
            if g not in seen:
                seen.append(g)
    return seen


def get_all_assets() -> list[str]:
    assets = get_asset_templates()
    seen = []
    for role_assets in assets.values():
        for a in role_assets:
            if a not in seen:
                seen.append(a)
    return seen


def get_all_project_names() -> list[str]:
    return [p["name"] for p in get_projects()]
