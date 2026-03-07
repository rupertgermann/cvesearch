"use client";

import Link from "next/link";
import { Badge, Button, Card, Flex, Grid, Heading, Tabs, Text } from "@radix-ui/themes";
import { DashboardWorkflowView, HomeDashboardData } from "@/lib/types";
import CVECard from "./CVECard";

interface DashboardPanelProps {
  dashboard: HomeDashboardData;
}

export default function DashboardPanel({ dashboard }: DashboardPanelProps) {
  return (
    <section className="mb-8 space-y-6">
      <Card size="4" className="border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
        <Flex justify="between" align={{ initial: "start", xl: "end" }} direction={{ initial: "column", xl: "row" }} gap="5">
          <div>
            <Text size="1" weight="bold" className="uppercase tracking-[0.24em] text-cyan-300">Operations Overview</Text>
            <Heading size="8" className="mt-2 text-white">Richer views for analysts, maintainers, and incident response</Heading>
            <Text as="p" size="3" color="gray" className="mt-3 max-w-3xl">
              The dashboard now breaks the recent sample into role-based queues so each team can jump directly into the issues that matter most to their workflow.
            </Text>
          </div>
          <Grid columns={{ initial: "2", sm: "3", xl: "5" }} gap="3" className="w-full xl:max-w-4xl">
            <SummaryTile label="Sampled" value={dashboard.summary.sampledCount} />
            <SummaryTile label="Critical" value={dashboard.summary.criticalCount} />
            <SummaryTile label="High or Above" value={dashboard.summary.highOrAboveCount} />
            <SummaryTile label="Published This Week" value={dashboard.summary.publishedThisWeekCount} />
            <SummaryTile label="Known Exploited" value={dashboard.summary.knownExploitedCount} />
          </Grid>
        </Flex>
      </Card>

      <Grid columns={{ initial: "1", lg: "3" }} gap="3">
        {dashboard.presets.map((preset) => (
          <Link key={preset.title} href={preset.href} className="block">
            <Card size="3" className={`h-full border transition-all hover:-translate-y-0.5 hover:border-white/20 ${preset.accentClassName}`}>
              <Heading size="4" className="text-white">{preset.title}</Heading>
              <Text as="p" size="2" className="mt-2 opacity-85">{preset.description}</Text>
            </Card>
          </Link>
        ))}
      </Grid>

      <Card size="4" className="border border-white/[0.08] bg-white/[0.02]">
        <Heading size="5" className="text-white">Workflow Views</Heading>
        <Text as="p" size="2" color="gray" className="mt-1">
          Switch between focused queues for analyst triage, maintainer patch planning, and incident response.
        </Text>

        <Tabs.Root defaultValue={dashboard.workflowViews[0]?.id ?? "analyst"} className="mt-4">
          <Tabs.List>
            {dashboard.workflowViews.map((view) => (
              <Tabs.Trigger key={view.id} value={view.id}>{view.title}</Tabs.Trigger>
            ))}
          </Tabs.List>

          {dashboard.workflowViews.map((view) => (
            <Tabs.Content key={view.id} value={view.id} className="pt-4">
              <WorkflowPanel view={view} />
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </Card>

      <Grid columns={{ initial: "1", xl: "3" }} gap="6">
        <DashboardColumn
          title="Latest Critical"
          description="Fresh critical issues from the sampled feed."
          cves={dashboard.latestCritical}
        />
        <DashboardColumn
          title="Highest Risk"
          description="KEV, EPSS, exploit signals, and severity combined into one view."
          cves={dashboard.highestRisk}
        />
        <DashboardColumn
          title="Recent High Impact"
          description="High-severity records published during the last 7 days."
          cves={dashboard.recentHighImpact}
        />
      </Grid>
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <Card size="2" className="border border-white/[0.08] bg-black/20">
      <Text as="p" size="5" weight="bold" className="text-white">{value}</Text>
      <Text as="p" size="2" color="gray" className="mt-1">{label}</Text>
    </Card>
  );
}

function WorkflowPanel({ view }: { view: DashboardWorkflowView }) {
  return (
    <div className={`rounded-2xl border p-4 ${view.accentClassName}`}>
      <Flex justify="between" align={{ initial: "start", md: "center" }} direction={{ initial: "column", md: "row" }} gap="3">
        <div>
          <Heading size="5" className="text-white">{view.title}</Heading>
          <Text as="p" size="2" className="mt-2 text-gray-200/90">{view.description}</Text>
        </div>
        <Button asChild variant="soft" color="gray" highContrast>
          <Link href={view.href}>Open Queue</Link>
        </Button>
      </Flex>

      <Grid columns={{ initial: "1", sm: "3" }} gap="2" className="mt-4">
        {view.metrics.map((metric) => (
          <Card key={`${view.id}-${metric.label}`} size="2" className="border border-white/10 bg-black/15">
            <Text as="p" size="4" weight="bold" className="text-white">{metric.value}</Text>
            <Text as="p" size="1" className="mt-1 uppercase tracking-wider text-gray-300/80">{metric.label}</Text>
          </Card>
        ))}
      </Grid>

      <div className="mt-4 space-y-3">
        {view.cves.length === 0 ? (
          <Card size="2" className="border border-white/10 bg-black/15">
            <Text size="2" className="text-gray-200/80">No matching vulnerabilities in the current sample.</Text>
          </Card>
        ) : (
          view.cves.map((cve) => <CompactDashboardCard key={`${view.id}-${cve.id}`} cve={cve} />)
        )}
      </div>
    </div>
  );
}

function DashboardColumn({
  title,
  description,
  cves,
}: {
  title: string;
  description: string;
  cves: HomeDashboardData["latestCritical"];
}) {
  return (
    <Card size="3" className="border border-white/[0.08] bg-white/[0.02]">
      <Heading size="4" className="text-white">{title}</Heading>
      <Text as="p" size="2" color="gray" className="mt-1">{description}</Text>
      <div className="mt-4 space-y-3">
        {cves.length === 0 ? (
          <Card size="2" className="border border-white/[0.06] bg-white/[0.02]">
            <Text size="2" color="gray">No matching vulnerabilities in the current sample.</Text>
          </Card>
        ) : (
          cves.map((cve) => <CVECard key={`${title}-${cve.id}`} cve={cve} />)
        )}
      </div>
    </Card>
  );
}

function CompactDashboardCard({ cve }: { cve: HomeDashboardData["latestCritical"][number] }) {
  return (
    <Card size="2" className="border border-white/10 bg-black/15">
      <Flex justify="between" align="start" gap="3">
        <div className="min-w-0">
          <Link href={`/cve/${encodeURIComponent(cve.id)}`} className="font-mono text-sm font-semibold text-white hover:text-cyan-300">
            {cve.id}
          </Link>
          <Text as="p" size="2" className="mt-1 line-clamp-2 text-gray-200/85">
            {cve.summary || cve.description || "No description available."}
          </Text>
        </div>
        {typeof cve.cvss3 === "number" || typeof cve.cvss === "number" ? (
          <Badge color="gray" variant="soft">CVSS {(cve.cvss3 ?? cve.cvss)?.toFixed(1)}</Badge>
        ) : null}
      </Flex>
      <Flex gap="2" wrap="wrap" className="mt-3">
        {cve.kev ? <Badge color="red" variant="soft">KEV</Badge> : null}
        {typeof cve.epss === "number" ? <Badge color="cyan" variant="soft">EPSS {(cve.epss * 100).toFixed(0)}%</Badge> : null}
        {(cve.vulnerable_product?.length ?? 0) > 0 ? <Badge color="green" variant="soft">{cve.vulnerable_product?.length} products</Badge> : null}
      </Flex>
    </Card>
  );
}
