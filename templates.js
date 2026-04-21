/**
 * Scientific starter templates for p2pmd (Markdown-only).
 */

export const TEMPLATES = [
  {
    id: "research-paper-md",
    label: "Research Paper",
    description: "Journal-style markdown template with KaTeX equations and table",
    slideTemplate: false,
    content: `## P2P Collaboration for Reproducible Technical Writing

**First Author** [1,*]  
**Second Author** [1,2]

[1] Systems Research Lab, Example University  
[2] P2P Applications Group, Example Institute

*Correspondence:* first.author@example.org

### Abstract

This starter captures the minimum structure expected for a short technical paper:
problem framing, reproducible method summary, and measurable outcomes.

### Introduction

Peer-to-peer authoring enables real-time collaboration without centralized storage.
We evaluate whether this model improves reliability and drafting speed.

### Method

We model editing throughput as:

$$
T = \\frac{N_{edits}}{\\Delta t}
$$

where $N_{edits}$ is accepted edits over elapsed time $\\Delta t$.

### Results

| Setup | Mean Throughput | Failure Recovery |
| --- | ---: | ---: |
| Centralized | 12.4 edits/min | 73% |
| P2P | 15.1 edits/min | 92% |

### References

- Author, A. (2025). Reproducible Collaboration.
- Author, B. (2024). Distributed Editing Systems.
`
  },
  {
    id: "technical-doc-md",
    label: "Technical Documentation",
    description: "Implementation-focused markdown template with API table and math",
    slideTemplate: false,
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
  if (!selectedTemplate) return;

  const hasExistingContent = (inputEl.value || "").trim().length > 0;
  if (hasExistingContent) {
    const confirmed = window.confirm("Replace current document with this template?");
    if (!confirmed) return;
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
}
