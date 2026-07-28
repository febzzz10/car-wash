import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import VehicleModelAutocomplete from "./vehicle-model-autocomplete";

const mockModels = [{ name: "WagonR" }, { name: "WR-V" }];

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

describe("VehicleModelAutocomplete", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders an input with name=model", () => {
    render(<VehicleModelAutocomplete name="model" />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("name", "model");
  });

  it("uses the provided value", () => {
    render(<VehicleModelAutocomplete name="model" value="WagonR" />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("WagonR");
  });

  it("uses the provided defaultValue", () => {
    render(<VehicleModelAutocomplete name="model" defaultValue="WR-V" />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("WR-V");
  });

  it("calls onChange when the value changes", () => {
    const onChange = vi.fn();
    render(<VehicleModelAutocomplete name="model" onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "W" } });
    expect(onChange).toHaveBeenCalledWith("W");
  });

  it("sets aria-autocomplete to list", () => {
    render(<VehicleModelAutocomplete name="model" />);
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-autocomplete",
      "list",
    );
  });

  it("does not call the API when the input is blank", async () => {
    render(<VehicleModelAutocomplete name="model" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    await vi.waitFor(() => {
      expect(api).not.toHaveBeenCalled();
    });
  });

  it("opens suggestions after typing and debouncing", async () => {
    vi.mocked(api).mockResolvedValue(mockModels);
    render(<VehicleModelAutocomplete name="model" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "W" } });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("WagonR");
    expect(options[1]).toHaveTextContent("WR-V");
  });

  it("shows loading state while fetching", async () => {
    let resolvePromise: (value: unknown) => void;
    vi.mocked(api).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    render(<VehicleModelAutocomplete name="model" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "W" } });
    await vi.waitFor(() => {
      expect(document.querySelector(".autocomplete-spinner")).toBeTruthy();
    });
    resolvePromise!(mockModels);
    await vi.waitFor(() => {
      expect(document.querySelector(".autocomplete-spinner")).toBeNull();
    });
  });

  it("closes dropdown on Escape", async () => {
    vi.mocked(api).mockResolvedValue(mockModels);
    render(<VehicleModelAutocomplete name="model" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "W" } });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
    fireEvent.keyDown(input, { key: "Escape" });
    await vi.waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("selects a suggestion on click", async () => {
    vi.mocked(api).mockResolvedValue(mockModels);
    const onChange = vi.fn();
    render(<VehicleModelAutocomplete name="model" onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "W" } });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
    const options = screen.getAllByRole("option");
    fireEvent.mouseDown(options[0]!);
    expect(onChange).toHaveBeenCalledWith("WagonR");
    await vi.waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("selects highlighted option on Enter", async () => {
    vi.mocked(api).mockResolvedValue(mockModels);
    const onChange = vi.fn();
    render(<VehicleModelAutocomplete name="model" onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "W" } });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("WagonR");
    await vi.waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("navigates with ArrowDown and ArrowUp", async () => {
    vi.mocked(api).mockResolvedValue(mockModels);
    render(<VehicleModelAutocomplete name="model" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "W" } });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("handles API failure without blocking input", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Network error"));
    const onChange = vi.fn();
    render(<VehicleModelAutocomplete name="model" onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "W" } });
    await vi.waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
    fireEvent.change(input, { target: { value: "WagonR" } });
    expect(onChange).toHaveBeenCalledWith("WagonR");
  });

  it("supports disabled state", () => {
    render(<VehicleModelAutocomplete disabled name="model" />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("supports required state", () => {
    render(<VehicleModelAutocomplete required name="model" />);
    expect(screen.getByRole("combobox")).toBeRequired();
  });

  it("supports placeholder", () => {
    render(<VehicleModelAutocomplete name="model" placeholder="Enter model" />);
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Enter model",
    );
  });

  it("supports aria-describedby", () => {
    render(
      <VehicleModelAutocomplete
        aria-describedby="model-desc"
        name="model"
      />,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-describedby",
      "model-desc",
    );
  });

  it("keeps aria-expanded false when closed", () => {
    render(<VehicleModelAutocomplete name="model" />);
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
