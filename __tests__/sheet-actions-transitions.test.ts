/**
 * Tests for the live-status transition rules used inside SheetActions.
 *
 * The sheet detail page shows each viewer their own registration state.
 * A realtime subscription watches the registrations table for changes to
 * the viewer's row and reflects them live. For the three transitions
 * that the viewer did NOT initiate themselves we fire a toast so they
 * notice. This file locks those rules; the component in
 * app/(app)/sheets/[id]/sheet-actions.tsx duplicates them deliberately.
 */

type Status = "confirmed" | "waitlist" | "withdrawn";

type ToastType = "success" | "error" | "info";

interface ToastCall {
  message: string;
  type: ToastType;
}

/** Mirrors the toast-emitting branches in the component's realtime handler. */
function decideToast(
  oldStatus: Status | undefined,
  newStatus: Status | undefined
): ToastCall | null {
  if (oldStatus === "confirmed" && newStatus === "waitlist") {
    return { message: "You've been moved to the waitlist.", type: "info" };
  }
  if (oldStatus === "waitlist" && newStatus === "confirmed") {
    return { message: "You've been promoted — you're confirmed!", type: "success" };
  }
  if (
    (oldStatus === "confirmed" || oldStatus === "waitlist") &&
    newStatus === "withdrawn"
  ) {
    return { message: "You've been removed from this event.", type: "info" };
  }
  return null;
}

/** Mirrors the liveReg state update in the component's realtime handler. */
function nextLiveReg(
  event: "INSERT" | "UPDATE" | "DELETE",
  row: { id: string; status?: Status } | null
): { id: string; status: Status } | null {
  if (event === "DELETE") return null;
  const status = row?.status;
  if (status === "confirmed" || status === "waitlist") {
    return { id: row!.id, status };
  }
  return null;
}

describe("decideToast", () => {
  test("confirmed → waitlist is an info toast", () => {
    expect(decideToast("confirmed", "waitlist")).toEqual({
      message: "You've been moved to the waitlist.",
      type: "info",
    });
  });

  test("waitlist → confirmed is a success toast", () => {
    expect(decideToast("waitlist", "confirmed")).toEqual({
      message: "You've been promoted — you're confirmed!",
      type: "success",
    });
  });

  test("confirmed → withdrawn is an info toast", () => {
    expect(decideToast("confirmed", "withdrawn")).toEqual({
      message: "You've been removed from this event.",
      type: "info",
    });
  });

  test("waitlist → withdrawn is an info toast", () => {
    expect(decideToast("waitlist", "withdrawn")).toEqual({
      message: "You've been removed from this event.",
      type: "info",
    });
  });

  test("no toast on first registration (undefined → confirmed / waitlist)", () => {
    expect(decideToast(undefined, "confirmed")).toBeNull();
    expect(decideToast(undefined, "waitlist")).toBeNull();
  });

  test("no toast on a no-op update (same status)", () => {
    expect(decideToast("confirmed", "confirmed")).toBeNull();
    expect(decideToast("waitlist", "waitlist")).toBeNull();
    expect(decideToast("withdrawn", "withdrawn")).toBeNull();
  });

  test("no toast on withdrawn → rejoining", () => {
    // A new signup reactivating a prior withdrawn row: user did this
    // themselves, the signup flow already shows feedback.
    expect(decideToast("withdrawn", "confirmed")).toBeNull();
    expect(decideToast("withdrawn", "waitlist")).toBeNull();
  });
});

describe("nextLiveReg", () => {
  test("INSERT confirmed → sets state to confirmed", () => {
    expect(nextLiveReg("INSERT", { id: "r1", status: "confirmed" })).toEqual({
      id: "r1",
      status: "confirmed",
    });
  });

  test("INSERT waitlist → sets state to waitlist", () => {
    expect(nextLiveReg("INSERT", { id: "r1", status: "waitlist" })).toEqual({
      id: "r1",
      status: "waitlist",
    });
  });

  test("UPDATE confirmed → waitlist flips state", () => {
    expect(nextLiveReg("UPDATE", { id: "r1", status: "waitlist" })).toEqual({
      id: "r1",
      status: "waitlist",
    });
  });

  test("UPDATE to withdrawn clears state", () => {
    expect(nextLiveReg("UPDATE", { id: "r1", status: "withdrawn" })).toBeNull();
  });

  test("DELETE clears state regardless of row status", () => {
    expect(nextLiveReg("DELETE", { id: "r1", status: "confirmed" })).toBeNull();
    expect(nextLiveReg("DELETE", null)).toBeNull();
  });
});
