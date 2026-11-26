-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "WorkflowVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DependencyCondition" AS ENUM ('SUCCESS');

-- CreateEnum
CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskExecutionStatus" AS ENUM ('BLOCKED', 'READY', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskAttemptStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "WorkflowVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDefinition" (
    "id" UUID NOT NULL,
    "workflowVersionId" UUID NOT NULL,
    "taskKey" VARCHAR(128) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "handlerKey" VARCHAR(128) NOT NULL,
    "configuration" JSONB NOT NULL,
    "timeoutSeconds" INTEGER,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "retryInitialDelaySeconds" INTEGER NOT NULL DEFAULT 5,
    "retryMaxDelaySeconds" INTEGER NOT NULL DEFAULT 300,
    "retryBackoffMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TaskDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" UUID NOT NULL,
    "workflowVersionId" UUID NOT NULL,
    "predecessorTaskId" UUID NOT NULL,
    "dependentTaskId" UUID NOT NULL,
    "condition" "DependencyCondition" NOT NULL DEFAULT 'SUCCESS',

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowExecution" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workflowVersionId" UUID NOT NULL,
    "status" "WorkflowExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "result" JSONB,
    "error" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskExecution" (
    "id" UUID NOT NULL,
    "workflowExecutionId" UUID NOT NULL,
    "workflowVersionId" UUID NOT NULL,
    "taskDefinitionId" UUID NOT NULL,
    "status" "TaskExecutionStatus" NOT NULL DEFAULT 'BLOCKED',
    "input" JSONB,
    "result" JSONB,
    "error" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TaskExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttempt" (
    "id" UUID NOT NULL,
    "taskExecutionId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "TaskAttemptStatus" NOT NULL DEFAULT 'RUNNING',
    "workerId" VARCHAR(128),
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),
    "error" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" UUID NOT NULL,
    "workerId" VARCHAR(128) NOT NULL,
    "hostname" VARCHAR(255),
    "status" "WorkerStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastHeartbeatAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionLease" (
    "id" UUID NOT NULL,
    "taskExecutionId" UUID NOT NULL,
    "workerId" VARCHAR(128) NOT NULL,
    "leaseToken" UUID NOT NULL,
    "fencingToken" BIGINT NOT NULL DEFAULT 1,
    "acquiredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "renewedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ExecutionLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowEvent" (
    "id" UUID NOT NULL,
    "workflowExecutionId" UUID NOT NULL,
    "taskExecutionId" UUID,
    "eventType" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" UUID NOT NULL,
    "eventType" VARCHAR(128) NOT NULL,
    "aggregateType" VARCHAR(128) NOT NULL,
    "aggregateId" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "publishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_role_idx" ON "OrganizationMember"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_userId_organizationId_key" ON "OrganizationMember"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "Workflow_organizationId_archivedAt_idx" ON "Workflow"("organizationId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_id_organizationId_key" ON "Workflow"("id", "organizationId");

-- CreateIndex
CREATE INDEX "WorkflowVersion_workflowId_status_idx" ON "WorkflowVersion"("workflowId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_workflowId_versionNumber_key" ON "WorkflowVersion"("workflowId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_id_organizationId_key" ON "WorkflowVersion"("id", "organizationId");

-- CreateIndex
CREATE INDEX "TaskDefinition_workflowVersionId_idx" ON "TaskDefinition"("workflowVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDefinition_workflowVersionId_taskKey_key" ON "TaskDefinition"("workflowVersionId", "taskKey");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDefinition_id_workflowVersionId_key" ON "TaskDefinition"("id", "workflowVersionId");

-- CreateIndex
CREATE INDEX "TaskDependency_workflowVersionId_idx" ON "TaskDependency"("workflowVersionId");

-- CreateIndex
CREATE INDEX "TaskDependency_dependentTaskId_idx" ON "TaskDependency"("dependentTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_predecessorTaskId_dependentTaskId_key" ON "TaskDependency"("predecessorTaskId", "dependentTaskId");

-- CreateIndex
CREATE INDEX "WorkflowExecution_organizationId_status_idx" ON "WorkflowExecution"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WorkflowExecution_workflowVersionId_idx" ON "WorkflowExecution"("workflowVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowExecution_id_workflowVersionId_key" ON "WorkflowExecution"("id", "workflowVersionId");

-- CreateIndex
CREATE INDEX "TaskExecution_workflowExecutionId_status_idx" ON "TaskExecution"("workflowExecutionId", "status");

-- CreateIndex
CREATE INDEX "TaskExecution_status_nextRetryAt_idx" ON "TaskExecution"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExecution_workflowExecutionId_taskDefinitionId_key" ON "TaskExecution"("workflowExecutionId", "taskDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExecution_id_workflowExecutionId_key" ON "TaskExecution"("id", "workflowExecutionId");

-- CreateIndex
CREATE INDEX "TaskAttempt_taskExecutionId_status_idx" ON "TaskAttempt"("taskExecutionId", "status");

-- CreateIndex
CREATE INDEX "TaskAttempt_workerId_idx" ON "TaskAttempt"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttempt_taskExecutionId_attemptNumber_key" ON "TaskAttempt"("taskExecutionId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_workerId_key" ON "Worker"("workerId");

-- CreateIndex
CREATE INDEX "Worker_status_lastHeartbeatAt_idx" ON "Worker"("status", "lastHeartbeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionLease_taskExecutionId_key" ON "ExecutionLease"("taskExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionLease_leaseToken_key" ON "ExecutionLease"("leaseToken");

-- CreateIndex
CREATE INDEX "ExecutionLease_expiresAt_idx" ON "ExecutionLease"("expiresAt");

-- CreateIndex
CREATE INDEX "ExecutionLease_workerId_idx" ON "ExecutionLease"("workerId");

-- CreateIndex
CREATE INDEX "WorkflowEvent_workflowExecutionId_occurredAt_idx" ON "WorkflowEvent"("workflowExecutionId", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkflowEvent_taskExecutionId_idx" ON "WorkflowEvent"("taskExecutionId");

-- CreateIndex
CREATE INDEX "Outbox_status_createdAt_idx" ON "Outbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Outbox_status_nextAttemptAt_idx" ON "Outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Outbox_aggregateType_aggregateId_idx" ON "Outbox"("aggregateType", "aggregateId");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_workflowId_organizationId_fkey" FOREIGN KEY ("workflowId", "organizationId") REFERENCES "Workflow"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDefinition" ADD CONSTRAINT "TaskDefinition_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_predecessorTaskId_workflowVersionId_fkey" FOREIGN KEY ("predecessorTaskId", "workflowVersionId") REFERENCES "TaskDefinition"("id", "workflowVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependentTaskId_workflowVersionId_fkey" FOREIGN KEY ("dependentTaskId", "workflowVersionId") REFERENCES "TaskDefinition"("id", "workflowVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_workflowVersionId_organizationId_fkey" FOREIGN KEY ("workflowVersionId", "organizationId") REFERENCES "WorkflowVersion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExecution" ADD CONSTRAINT "TaskExecution_workflowExecutionId_workflowVersionId_fkey" FOREIGN KEY ("workflowExecutionId", "workflowVersionId") REFERENCES "WorkflowExecution"("id", "workflowVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExecution" ADD CONSTRAINT "TaskExecution_taskDefinitionId_workflowVersionId_fkey" FOREIGN KEY ("taskDefinitionId", "workflowVersionId") REFERENCES "TaskDefinition"("id", "workflowVersionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_taskExecutionId_fkey" FOREIGN KEY ("taskExecutionId") REFERENCES "TaskExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttempt" ADD CONSTRAINT "TaskAttempt_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("workerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLease" ADD CONSTRAINT "ExecutionLease_taskExecutionId_fkey" FOREIGN KEY ("taskExecutionId") REFERENCES "TaskExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLease" ADD CONSTRAINT "ExecutionLease_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("workerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_workflowExecutionId_fkey" FOREIGN KEY ("workflowExecutionId") REFERENCES "WorkflowExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_taskExecutionId_workflowExecutionId_fkey" FOREIGN KEY ("taskExecutionId", "workflowExecutionId") REFERENCES "TaskExecution"("id", "workflowExecutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A task edge cannot point from a task to itself.
ALTER TABLE "TaskDependency"
ADD CONSTRAINT "TaskDependency_no_self_dependency_check"
CHECK ("predecessorTaskId" <> "dependentTaskId");

-- The lease row is retained across ownership changes. Reassignment must rotate
-- the lease token and advance the fencing token in the same transaction.
ALTER TABLE "ExecutionLease"
ADD CONSTRAINT "ExecutionLease_fencingToken_positive_check"
CHECK ("fencingToken" > 0);

CREATE FUNCTION "enforce_execution_lease_fencing_generation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."workerId" IS DISTINCT FROM OLD."workerId"
       OR NEW."leaseToken" IS DISTINCT FROM OLD."leaseToken" THEN
        IF NEW."leaseToken" IS NOT DISTINCT FROM OLD."leaseToken"
           OR NEW."fencingToken" <= OLD."fencingToken" THEN
            RAISE EXCEPTION 'lease reassignment must rotate its token and increase its fencing token';
        END IF;
    ELSIF NEW."fencingToken" <> OLD."fencingToken" THEN
        RAISE EXCEPTION 'fencing token may change only when lease ownership changes';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "ExecutionLease_fencing_generation_trigger"
BEFORE UPDATE ON "ExecutionLease"
FOR EACH ROW
EXECUTE FUNCTION "enforce_execution_lease_fencing_generation"();
