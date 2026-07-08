"""
Single source of truth for values that were previously duplicated or
hardcoded independently across multiple files (orchestrators, progress
calculations, approval logic). Import from here instead of retyping.
"""

APPROVER_ROLES = ["HR", "Manager", "IT", "Security"]

DEPROVISION_ACTIONS = ["Disable User", "Remove Groups", "Remove Applications", "Remove VPN", "Archive Files"]
