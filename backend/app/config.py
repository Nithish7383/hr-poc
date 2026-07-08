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
