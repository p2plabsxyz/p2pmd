/**
 * Scientific starter templates for p2pmd (Markdown-only).
 */

export const TEMPLATES = [
  {
    id: "research-paper-md",
    label: "Research Paper",
    description: "Journal-style markdown template with KaTeX equations and table",
    slideTemplate: false,
    ieeeMode: true,
    content: `<!-- ieee -->

## P2P Collaboration for Reproducible Technical Writing

**First Author** [1,*]  
**Second Author** [1,2]  
**Third Author** [2,3]

[1] Systems Research Lab, Example University  
[2] P2P Applications Group, Example Institute  
[3] Collaborative Systems Unit, Demo Labs

*Correspondence:* first.author@example.org  
*Correspondence:* second.author@example.org  
*Correspondence:* third.author@example.org

### Abstract

This starter captures the minimum structure expected for a short technical paper:
problem framing, reproducible method summary, and measurable outcomes.
We study whether a peer-to-peer markdown workflow can improve iteration speed
without reducing document quality, citation consistency, or recovery behavior
under unstable network conditions. Our evaluation compares centralized and
P2P collaboration sessions across repeated drafting tasks and controlled
failure events. Results indicate higher sustained throughput, faster recovery,
and better continuity for distributed editing when conflict resolution and
incremental synchronization are configured carefully.

### Introduction

Peer-to-peer authoring enables real-time collaboration without centralized storage.
We evaluate whether this model improves reliability and drafting speed.
Traditional document pipelines typically rely on a single service for state,
history, and synchronization. That model is convenient but can create a
single operational dependency during active co-authoring. In contrast, P2P
collaboration distributes state across participants and reduces dependence on
one coordination endpoint.

The practical question is not only whether P2P works, but whether it provides
measurable improvement during realistic writing sessions. Authors need fast
feedback, deterministic merge behavior, clear ownership signals, and minimal
disruption when peers disconnect and reconnect. We therefore focus on
throughput, conflict cost, and recovery latency as first-order metrics.

Our target scenario is short technical writing with equations, references, and
tables. This scenario is sensitive to accidental formatting drift and line-level
merge conflicts, making it a useful stress case for real-time synchronization.
The goal is not to claim universal superiority, but to characterize when P2P
collaboration is a better operational fit than centralized drafting.

### Method

We model editing throughput as:

$$
T = \\frac{N_{edits}}{\\Delta t}
$$

where $N_{edits}$ is accepted edits over elapsed time $\\Delta t$.
Each experiment run includes two co-authors and one observer node. Authors are
assigned equivalent editing tasks that include rewriting, table updates, and
math insertion. We log local operation timestamps, accepted remote operations,
and replayed operations after reconnection events.

To evaluate resilience, we inject transient disconnects and delayed packet
delivery windows at fixed intervals. We then measure time-to-consistency,
dropped operations, and manual conflict interventions required to restore the
intended document state. Runs are repeated multiple times with randomized
edit ordering to reduce sequence bias.

### Results

| Setup | Mean Throughput | Failure Recovery |
| --- | ---: | ---: |
| Centralized | 12.4 edits/min | 73% |
| P2P | 15.1 edits/min | 92% |
| P2P + delayed peers | 14.2 edits/min | 88% |
| P2P + packet loss profile | 13.9 edits/min | 85% |

Across repeated trials, P2P maintained a higher median throughput under normal
conditions and showed smaller variance during reconnect phases. Centralized
sessions performed comparably during stable intervals but degraded more sharply
when service reachability was reduced.

Conflict intervention frequency was lower in the P2P setup when line attribution
and incremental operation batching were enabled. In degraded network profiles,
the dominant cost shifted from merge complexity to delayed visibility of remote
intent, suggesting that UI affordances for peer activity remain important even
when synchronization semantics are robust.

Overall, the data supports the claim that P2P collaboration can improve
operational continuity for technical drafting, provided that implementation
details prioritize deterministic replay, low-latency local commits, and clear
conflict boundaries.

### References

- Author, A. (2025). Reproducible Collaboration.
- Author, B. (2024). Distributed Editing Systems.
- Author, C. (2023). Consistency Models for Shared Editors.
- Author, D. (2022). Conflict Resolution in Real-Time Markdown Workflows.
`
  },
  {
    id: "technical-doc-md",
    label: "Technical Documentation",
    description: "Implementation-focused markdown template with API table and math",
    slideTemplate: false,
    ieeeMode: false,
    content: `## Technical Documentation: P2P Sync Service

### Overview

This document describes the sync protocol, expected request/response shapes,
and operational safeguards for the P2P markdown collaboration service.

### Quick Start

1. Create room
2. Join with key
3. Stream incremental updates

### API Surface

| Endpoint | Method | Purpose |
| --- | --- | --- |
| /api/room | POST | Create or join room |
| /api/update | POST | Push incremental update |
| /api/events | GET (SSE) | Receive remote updates |

### Throughput Estimate

$$
R = \\frac{B}{S}
$$

where $R$ is updates/sec, $B$ is network bandwidth, and $S$ is average payload size.

### Notes

- Keep payloads small and incremental.
- Retry idempotent operations on transient failures.
- Log room events for debugging and auditability.
`
  }
];

/**
 * Replace editor content with a selected template.
 */
export function applyTemplate(templateId, inputEl, scheduleRender) {
  const selectedTemplate = TEMPLATES.find((item) => item.id === templateId);
  if (!selectedTemplate) return false;

  const hasExistingContent = (inputEl.value || "").trim().length > 0;
  if (hasExistingContent) {
    const confirmed = window.confirm("Replace current document with this template?");
    if (!confirmed) return false;
  }

  inputEl.value = selectedTemplate.content;
  const templateLineCount = (selectedTemplate.content.match(/\n/g) || []).length + 1;

  if (typeof window.attributeLocalLineRange === "function") {
    window.attributeLocalLineRange(1, templateLineCount, { reset: true });
  }

  if (!selectedTemplate.slideTemplate && window.isSlideMode && typeof window.exitSlideMode === "function") {
    window.exitSlideMode();
  }

  inputEl.focus();
  inputEl.setSelectionRange(0, 0);
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  scheduleRender();
  return true;
}
