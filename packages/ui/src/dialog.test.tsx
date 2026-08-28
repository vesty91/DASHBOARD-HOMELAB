/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog, Dialog } from "./dialog";

afterEach(() => cleanup());

function DialogHarness({ onClose = () => undefined }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <button type="button">Background</button>
      <Dialog
        open={open}
        title="Example"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <button type="button">First</button>
        <button type="button">Last</button>
      </Dialog>
    </div>
  );
}

function ConfirmHarness({ onCancel = () => undefined }: { onCancel?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open confirm
      </button>
      <button type="button">Background</button>
      {open ? (
        <ConfirmDialog
          title="Confirm"
          onCancel={() => {
            onCancel();
            setOpen(false);
          }}
        >
          <p>Are you sure?</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

async function expectFocusInside(role: "dialog" | "alertdialog") {
  await waitFor(() => {
    const panel = screen.getByRole(role);
    expect(panel.contains(document.activeElement)).toBe(true);
  });
}

function dialogButtons(role: "dialog" | "alertdialog") {
  const buttons = within(screen.getByRole(role)).getAllByRole("button");
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (!first || !last) throw new Error("expected dialog buttons");
  return { first, last, buttons };
}

describe("Dialog focus trap", () => {
  it("moves focus into the dialog on open", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await expectFocusInside("dialog");
  });

  it("wraps Tab from the last focusable to the first", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");
    const { first, last } = dialogButtons("dialog");
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from the first focusable to the last", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");
    const { first, last } = dialogButtons("dialog");
    first.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it("calls onClose on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("restores focus to the trigger on close", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("does not move Tab focus onto a background button", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const background = screen.getByRole("button", { name: "Background" });
    for (let index = 0; index < 8; index += 1) await user.tab();
    expect(document.activeElement).not.toBe(background);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });
});

describe("ConfirmDialog focus trap", () => {
  it("traps Tab inside the alertdialog", async () => {
    const user = userEvent.setup();
    render(<ConfirmHarness />);
    await user.click(screen.getByRole("button", { name: "Open confirm" }));
    await expectFocusInside("alertdialog");
    const dialog = screen.getByRole("alertdialog");
    const { first, last } = dialogButtons("alertdialog");
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);
    first.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
    const background = screen.getByRole("button", { name: "Background" });
    for (let index = 0; index < 6; index += 1) await user.tab();
    expect(document.activeElement).not.toBe(background);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("restores focus to the trigger on close", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ConfirmHarness onCancel={onCancel} />);
    const trigger = screen.getByRole("button", { name: "Open confirm" });
    await user.click(trigger);
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
