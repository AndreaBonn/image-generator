import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def create_jobs() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("task_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("comfy_prompt_id", sa.String()),
        sa.Column("request", sa.JSON(), nullable=False),
        sa.Column("error_code", sa.String()),
        sa.Column("error_message", sa.String()),
        sa.Column("idempotency_key", sa.String()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_jobs_status", "jobs", ["status"])
    op.create_index("idx_jobs_created_at", "jobs", ["created_at"])
    op.create_index("idx_jobs_idempotency_key", "jobs", ["idempotency_key"], unique=True)


def create_generations() -> None:
    op.create_table(
        "generations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("job_id", sa.String(), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("task_id", sa.String(), nullable=False),
        sa.Column("model_ids", sa.JSON(), nullable=False),
        sa.Column("prompt", sa.String(), nullable=False),
        sa.Column("negative_prompt", sa.String(), nullable=False),
        sa.Column("prompt_final", sa.String(), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("image_path", sa.String(), nullable=False),
        sa.Column("thumb_path", sa.String(), nullable=False),
        sa.Column("parent_id", sa.String(), sa.ForeignKey("generations.id")),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("favorite", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime()),
    )
    for column in ("created_at", "task_id", "parent_id", "job_id"):
        op.create_index(f"idx_generations_{column}", "generations", [column])


def upgrade() -> None:
    create_jobs()
    create_generations()
    op.create_table(
        "uploads",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("path", sa.String(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("uploads")
    op.drop_table("generations")
    op.drop_table("jobs")
