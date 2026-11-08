"use client";

export function ModeSwitch({ value }: { value?: string }) {
  return (
    <fieldset className="mode-switch">
      <legend>Rental mode</legend>
      <label><input type="radio" name="mode" value="" defaultChecked={!value} /> All modes</label>
      <label><input type="radio" name="mode" value="SHORT_STAY" defaultChecked={value === "SHORT_STAY"} /> Short-stay</label>
      <label><input type="radio" name="mode" value="LONG_TERM" defaultChecked={value === "LONG_TERM"} /> Long-term</label>
    </fieldset>
  );
}
