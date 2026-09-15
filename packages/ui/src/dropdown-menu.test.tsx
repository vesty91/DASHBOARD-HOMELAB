/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { DropdownItem, DropdownMenu } from "./dropdown-menu";

afterEach(() => cleanup());

describe("DropdownMenu", () => {
  it("exposes aria-expanded and aria-controls on the trigger", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={
          <button type="button" aria-haspopup="menu">
            Account
          </button>
        }
      >
        <DropdownItem href="/account">Compte</DropdownItem>
      </DropdownMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Account" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    const menuId = trigger.getAttribute("aria-controls");
    expect(menuId).toBeTruthy();
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu").getAttribute("id")).toBe(menuId);
  });
});
