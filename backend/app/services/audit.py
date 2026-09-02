"""Thin helper around the `audit_logs` table (see 0001_init_schema.sql)."""
import logging

logger = logging.getLogger(__name__)


def log_action(sb, actor_id: str | None, action: str, entity_type: str, entity_id: str | None = None, metadata: dict | None = None, actor_type: str = "user"):
    """
    Best-effort audit log write. Never raises — a logging failure must
    never block the actual business operation it's recording.
    """
    try:
        sb.table("audit_logs").insert({
            "actor_type": actor_type,
            "actor_id": actor_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "metadata": metadata or {},
        }).execute()
    except Exception as e:
        logger.warning("audit log write failed (action=%s entity=%s/%s): %s", action, entity_type, entity_id, e)
