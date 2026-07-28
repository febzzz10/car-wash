import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import VehicleMakeAutocomplete from "./vehicle-make-autocomplete";

const mockMakes = [{ name: "Tata" }, { name: "Toyota" }];

vi.mock("../lib/api", () => ({
  api: vi.fn(),
  queryString: vi.fn().mockImplementation(
    (params: Record<string, string | undefined>) => {
      const filtered: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") filtered[k] = v;
      }
      return `?${new URLSearchParams(filtered).toString()}`;
    },
  ),
}));

const { api } = vi.mocked(await import("../lib/api"));

describe("VehicleMakeAutocomplete", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders an input with name=make", () => {
    render(<VehicleMakeAutocomplete name="make" />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("name", "make");
  });

  it("fetches from /vehicle-makes endpoint", async () => {
    vi.mocked(api).mockResolvedValue(mockMakes);
    render(<VehicleMakeAutocomplete name="make" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "T" } });
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        expect.stringContaining("/vehicle-makes"),
        expect.anything(),
      );
    });
  });

  it("uses the provided value", () => {
    render(<VehicleMakeAutocomplete name="make" value="Tata" />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("Tata");
  });

  it("uses the provided defaultValue", () => {
    render(<VehicleMakeAutocomplete name="make" defaultValue="Toyota" />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("Toyota");
  });

  it("calls onChange when the value changes", () => {
    const onChange = vi.fn();
    render(<VehicleMakeAutocomplete name="make" onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "T" } });
    expect(onChange).toHaveBeenCalledWith("T");
  });

  it("sets aria-autocomplete to list", () => {
    render(<VehicleMakeAutocomplete name="make" />);
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-autocomplete",
      "list",
    );
  });

  it("does not call the API when the input is blank", async () => {
    render(<VehicleMakeAutocomplete name="make" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    await vi.waitFor(() => {
      expect(api).not.toHaveBeenCalled();
    });
  });
});
