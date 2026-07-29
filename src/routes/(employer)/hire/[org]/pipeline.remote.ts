import * as v from 'valibot';
import { command, getRequestEvent, query } from '$app/server';
import { requirePermission } from '#lib/server/auth/guards';
import * as pipeline from '#lib/server/services/pipeline';

/**
 * The hiring board.
 *
 * Reads need `application.view`; moving a card needs `application.advance`, and
 * dropping into a rejecting column additionally needs `application.reject`.
 * Editing the columns themselves is `pipeline.manage`, which a hiring manager
 * does not hold — they work inside the process rather than redefining it.
 *
 * Every one of these guards for itself. Remote functions are plain HTTP
 * endpoints, so the fact that the board page is behind a route group proves
 * nothing about who is calling.
 */

const stageKind = v.picklist(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected']);
const uuid = v.pipe(v.string(), v.uuid());

const stageName = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty('Give the stage a name.'),
	v.maxLength(40, 'Keep stage names short enough to read as a column heading.')
);

/**
 * Everything the board draws, in one call.
 *
 * Columns and cards together rather than as two queries: fetched separately they
 * can disagree — a card arriving that references a stage the other response has
 * not heard of yet — and the board would have to decide which one to believe.
 */
export const getBoard = query(
	v.object({ orgSlug: v.string(), jobId: uuid }),
	async ({ orgSlug, jobId }) => {
		const { organizationId, role } = await requirePermission(orgSlug, 'application.view');

		const [stages, cards] = await Promise.all([
			pipeline.ensureStages(jobId, organizationId),
			pipeline.board(jobId, organizationId)
		]);

		return {
			stages: stages.map((stage) => ({
				id: stage.id,
				name: stage.name,
				kind: stage.kind,
				position: stage.position
			})),
			cards,
			// Sent with the data so the page can hide affordances it would be told off
			// for using. The server still checks on every write — this is politeness,
			// not protection.
			role
		};
	}
);

export const moveCard = command(
	v.object({
		orgSlug: v.string(),
		jobId: uuid,
		applicationId: uuid,
		toStageId: uuid,
		/** Required by the service when the target column rejects. */
		reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)))
	}),
	async ({ orgSlug, jobId, applicationId, toStageId, reason }) => {
		// `advance` is the floor. If the destination turns out to reject, the extra
		// check below applies — resolved here rather than in the service so the
		// permission model stays in one layer.
		const context = await requirePermission(orgSlug, 'application.advance');

		const stages = await pipeline.listStages(jobId);
		const target = stages.find((stage) => stage.id === toStageId);
		if (target?.kind === 'rejected') {
			await requirePermission(orgSlug, 'application.reject');
		}

		const { url } = getRequestEvent();

		const result = await pipeline.moveToStage({
			applicationId,
			toStageId,
			organizationId: context.organizationId,
			actorUserId: context.user.id,
			reason,
			origin: url.origin
		});

		await getBoard({ orgSlug, jobId }).refresh();
		return result;
	}
);

export const addStage = command(
	v.object({ orgSlug: v.string(), jobId: uuid, name: stageName, kind: stageKind }),
	async ({ orgSlug, jobId, name, kind }) => {
		await requirePermission(orgSlug, 'pipeline.manage');
		const stage = await pipeline.addStage(jobId, name, kind);

		await getBoard({ orgSlug, jobId }).refresh();
		return { id: stage.id };
	}
);

export const renameStage = command(
	v.object({ orgSlug: v.string(), jobId: uuid, stageId: uuid, name: stageName }),
	async ({ orgSlug, jobId, stageId, name }) => {
		await requirePermission(orgSlug, 'pipeline.manage');
		await pipeline.renameStage(stageId, jobId, name);

		await getBoard({ orgSlug, jobId }).refresh();
		return { renamed: true };
	}
);

export const deleteStage = command(
	v.object({ orgSlug: v.string(), jobId: uuid, stageId: uuid }),
	async ({ orgSlug, jobId, stageId }) => {
		await requirePermission(orgSlug, 'pipeline.manage');
		await pipeline.deleteStage(stageId, jobId);

		await getBoard({ orgSlug, jobId }).refresh();
		return { deleted: true };
	}
);

export const reorderStages = command(
	v.object({
		orgSlug: v.string(),
		jobId: uuid,
		// The complete set, in the new order. The service rejects a partial list
		// rather than guessing where the missing stages should go.
		orderedIds: v.pipe(v.array(uuid), v.minLength(1))
	}),
	async ({ orgSlug, jobId, orderedIds }) => {
		await requirePermission(orgSlug, 'pipeline.manage');
		await pipeline.reorderStages(jobId, orderedIds);

		await getBoard({ orgSlug, jobId }).refresh();
		return { reordered: true };
	}
);

/**
 * Move a selection of cards to one stage.
 *
 * Each card goes through the same path a single move takes, so a batch cannot
 * bypass the rejection reason, the response clock or the candidate's email. The
 * result names anything that did not move rather than failing the whole batch —
 * one withdrawn candidate should not abandon the other twenty-nine.
 */
export const moveMany = command(
	v.object({
		orgSlug: v.string(),
		jobId: uuid,
		applicationIds: v.pipe(v.array(uuid), v.minLength(1), v.maxLength(100)),
		toStageId: uuid,
		reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)))
	}),
	async ({ orgSlug, jobId, applicationIds, toStageId, reason }) => {
		const context = await requirePermission(orgSlug, 'application.advance');

		const stages = await pipeline.listStages(jobId);
		const target = stages.find((stage) => stage.id === toStageId);
		if (target?.kind === 'rejected') {
			await requirePermission(orgSlug, 'application.reject');
		}

		const { url } = getRequestEvent();

		const result = await pipeline.moveManyToStage(applicationIds, {
			toStageId,
			organizationId: context.organizationId,
			actorUserId: context.user.id,
			reason,
			origin: url.origin
		});

		await getBoard({ orgSlug, jobId }).refresh();
		return result;
	}
);
