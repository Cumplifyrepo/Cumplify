/**
 * MgmtCostMonitor — DETECTIVE control complementing the synth-time account
 * boundary guardrail (env-config.ts assertWorkloadAccountBoundary + CumplifyStage).
 *
 * The preventive guardrail blocks workload stacks from deploying to mgmt via the
 * pipeline. This catches anything that bypasses the pipeline entirely — a console
 * click, a rogue script, a manual `cdk deploy` — by alerting if the management
 * account's spend jumps. Owner request 2026-07-04.
 *
 * Two layers: a hard-threshold monthly Budget, and ML-based Cost Anomaly
 * Detection (no threshold guessing). Both scoped to the mgmt linked account.
 */
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as ce from 'aws-cdk-lib/aws-ce';
import { Construct } from 'constructs';
import { MGMT_ACCOUNT } from './env-config.js';

export interface MgmtCostMonitorProps {
  /** Email that receives budget + anomaly alerts. */
  readonly alertEmail: string;
  /** Monthly USD budget for the mgmt account (alerts at 80% actual / 100% forecast). */
  readonly monthlyBudgetUsd: number;
}

export class MgmtCostMonitor extends Construct {
  constructor(scope: Construct, id: string, props: MgmtCostMonitorProps) {
    super(scope, id);
    const { alertEmail, monthlyBudgetUsd } = props;
    const emailSub = [{ subscriptionType: 'EMAIL', address: alertEmail }];

    // Hard-threshold backstop: monthly cost budget scoped to the mgmt account.
    new budgets.CfnBudget(this, 'MgmtBudget', {
      budget: {
        budgetName: 'cumplify-mgmt-account-guardrail',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: monthlyBudgetUsd, unit: 'USD' },
        costFilters: { LinkedAccount: [MGMT_ACCOUNT] },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: emailSub,
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: emailSub,
        },
      ],
    });

    // ML-based Cost Anomaly Detection on the mgmt linked account.
    const monitor = new ce.CfnAnomalyMonitor(this, 'MgmtAnomalyMonitor', {
      monitorName: 'cumplify-mgmt-anomaly',
      monitorType: 'CUSTOM',
      monitorSpecification: JSON.stringify({
        Dimensions: { Key: 'LINKED_ACCOUNT', Values: [MGMT_ACCOUNT] },
      }),
    });

    new ce.CfnAnomalySubscription(this, 'MgmtAnomalySubscription', {
      subscriptionName: 'cumplify-mgmt-anomaly-email',
      frequency: 'DAILY', // EMAIL subscribers require DAILY or WEEKLY
      monitorArnList: [monitor.attrMonitorArn],
      subscribers: [{ type: 'EMAIL', address: alertEmail }],
      // Alert when a detected anomaly's total impact is >= $10.
      thresholdExpression: JSON.stringify({
        Dimensions: {
          Key: 'ANOMALY_TOTAL_IMPACT_ABSOLUTE',
          Values: ['10'],
          MatchOptions: ['GREATER_THAN_OR_EQUAL'],
        },
      }),
    });
  }
}
