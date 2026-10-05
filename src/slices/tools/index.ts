/**
 * Tools slice for pi-system-one.
 * Exposes model-callable operations for System One classification, task routing, and safety checks.
 *
 * Model-facing text (descriptions and return values) remains English in all locales.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { evaluateSafety, runClassification } from "../../shared/classifier.js";
import type { PluginState } from "../../shared/state.js";

const ActionTypeSchema = StringEnum(["status", "ping"] as const);

export function registerTools(pi: ExtensionAPI, state: PluginState): void {
	// 1. General System One Classification Tool
	pi.registerTool({
		name: "system_one_classify",
		description:
			"Evaluate JSON state against typed questions (bool, choice, score) using the ultra-fast System One classifier (JEV/Clef).",
		parameters: Type.Object({
			state: Type.Record(Type.String(), Type.Unknown(), {
				description: "JSON state or data to evaluate",
			}),
			questions: Type.Record(
				Type.String(),
				Type.Object({
					type: StringEnum(["bool", "choice", "score"] as const),
					instructions: Type.String({ description: "Question prompt" }),
					criteria: Type.Optional(Type.Unknown({ description: "Choice map or score criteria array" })),
				}),
				{ description: "Map of question_id to typed question definition" },
			),
		}),
		async execute(_toolCallId, params, ctx) {
			try {
				const { result, metric } = await runClassification(
					ctx.modelRegistry,
					state.config,
					{
						state: params.state as Record<string, unknown>,
						questions: params.questions as any,
					},
				);

				state.recordClassification(metric);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									answers: result.answers,
									stopReason: result.stopReason,
									durationMs: metric.durationMs,
									costUsd: metric.costUsd,
									provider: metric.provider,
									model: metric.model,
								},
								null,
								2,
							),
						},
					],
					details: {
						answers: result.answers,
						metric,
					},
				};
			} catch (err: any) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `System One classification failed: ${err?.message || String(err)}`,
						},
					],
				};
			}
		},
	});

	// 2. Task & Strategy Router Tool
	pi.registerTool({
		name: "system_one_route",
		description:
			"Evaluate a task against candidate tools or strategies and return the best choice with probability distributions.",
		parameters: Type.Object({
			task: Type.String({ description: "The task description or goal to route" }),
			candidates: Type.Record(Type.String(), Type.String(), {
				description: "Key-value dictionary of option_name -> description of what it does",
			}),
		}),
		async execute(_toolCallId, params, ctx) {
			try {
				const { result, metric } = await runClassification(
					ctx.modelRegistry,
					state.config,
					{
						state: { task: params.task },
						questions: {
							route: {
								type: "choice",
								instructions: "Which option is most appropriate for the task?",
								criteria: params.candidates,
							},
						},
					},
				);

				const answer = result.answers.route;
				state.recordClassification(metric);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									decision: answer,
									durationMs: metric.durationMs,
									costUsd: metric.costUsd,
									model: `${metric.provider}/${metric.model}`,
								},
								null,
								2,
							),
						},
					],
					details: {
						decision: answer,
						metric,
					},
				};
			} catch (err: any) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `System One routing failed: ${err?.message || String(err)}`,
						},
					],
				};
			}
		},
	});

	// 3. Command Safety Evaluator Tool
	pi.registerTool({
		name: "system_one_safety",
		description:
			"Evaluate whether a shell or git command is potentially destructive or dangerous before execution.",
		parameters: Type.Object({
			command: Type.String({ description: "The shell or git command to evaluate" }),
		}),
		async execute(_toolCallId, params, ctx) {
			try {
				const evaluation = await evaluateSafety(ctx.modelRegistry, state.config, params.command);
				state.recordClassification(evaluation.metric);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									command: params.command,
									isDangerous: evaluation.isDangerous,
									riskScore: evaluation.riskScore,
									reason: evaluation.reason,
									durationMs: evaluation.metric.durationMs,
									costUsd: evaluation.metric.costUsd,
								},
								null,
								2,
							),
						},
					],
					details: evaluation,
				};
			} catch (err: any) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `System One safety check failed: ${err?.message || String(err)}`,
						},
					],
				};
			}
		},
	});

	// 4. Status Check Tool
	pi.registerTool({
		name: "system_one_status",
		description: "Check status, configuration, and statistics of the System One classifier plugin.",
		parameters: Type.Object({
			action: ActionTypeSchema,
		}),
		async execute(_toolCallId, params) {
			if (params.action === "status") {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									enabled: state.config.enabled,
									mode: state.config.mode,
									preferredModel: `${state.config.preferredProvider}/${state.config.preferredModel}`,
									stats: state.stats,
								},
								null,
								2,
							),
						},
					],
				};
			}
			return {
				content: [{ type: "text", text: "pong" }],
			};
		},
	});
}
