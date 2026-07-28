import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import VehicleAttributeAutocomplete from "./vehicle-attribute-autocomplete";

const mockResults = [{ name: "Tata" }, { name: "Toyota" }];

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

describe("VehicleAttributeAutocomplete", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders an input with the given name", () => {
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("name", "make");
  });

  it("uses the provided value", () => {
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" value="Tata" />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("Tata");
  });

  it("uses the provided defaultValue", () => {
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" defaultValue="Toyota" />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("Toyota");
  });

  it("calls onChange when the value changes", () => {
    const onChange = vi.fn();
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" onChange={onChange} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "T" } });
    expect(onChange).toHaveBeenCalledWith("T");
  });

  it("sets aria-autocomplete to list", () => {
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" />);
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-autocomplete",
      "list",
    );
  });

  it("fetches from the given endpoint", async () => {
    vi.mocked(api).mockResolvedValue(mockResults);
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "T" } });
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        expect.stringContaining("/vehicle-makes"),
        expect.anything(),
      );
    });
  });

  it("does not call the API when the input is blank", async () => {
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    await vi.waitFor(() => {
      expect(api).not.toHaveBeenCalled();
    });
  });

  it("opens suggestions after typing and debouncing", async () => {
    vi.mocked(api).mockResolvedValue(mockResults);
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "T" } });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Tata");
    expect(options[1]).toHaveTextContent("Toyota");
  });

  it("shows loading state while fetching", async () => {
    let resolvePromise: (value: unknown) => void;
    vi.mocked(api).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "T" } });
    await vi.waitFor(() => {
      expect(document.querySelector(".autocomplete-spinner")).toBeTruthy();
    });
    resolvePromise!(mockResults);
    await vi.waitFor(() => {
      expect(document.querySelector(".autocomplete-spinner")).toBeNull();
    });
  });

  it("closes dropdown on Escape", async () => {
    vi.mocked(api).mockResolvedValue(mockResults);
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "T" } });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
    fireEvent.keyDown(input, { key: "Escape" });
    await vi.waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("selects a suggestion on click", async () => {
    vi.mocked(api).mockResolvedValue(mockResults);
    const onChange = vi.fn();
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "T" } });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
    const options = screen.getAllByRole("option");
    fireEvent.mouseDown(options[0]!);
    expect(onChange).toHaveBeenCalledWith("Tata");
    await vi.waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("selects highlighted option on Enter", async () => {
    vi.mocked(api).mockResolvedValue(mockResults);
    const onChange = vi.fn();
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "T" } });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("Tata");
    await vi.waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("navigates with ArrowDown and ArrowUp", async () => {
    vi.mocked(api).mockResolvedValue(mockResults);
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "T" } });
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
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" onChange={onChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "T" } });
    await vi.waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
    fireEvent.change(input, { target: { value: "Tata" } });
    expect(onChange).toHaveBeenCalledWith("Tata");
  });

  it("supports disabled state", () => {
    render(<VehicleAttributeAutocomplete disabled endpoint="/vehicle-makes" name="make" />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("supports required state", () => {
    render(<VehicleAttributeAutocomplete required endpoint="/vehicle-makes" name="make" />);
    expect(screen.getByRole("combobox")).toBeRequired();
  });

  it("supports placeholder", () => {
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" placeholder="Enter make" />);
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "placeholder",
      "Enter make",
    );
  });

  it("supports aria-describedby", () => {
    render(
      <VehicleAttributeAutocomplete
        aria-describedby="make-desc"
        endpoint="/vehicle-makes"
        name="make"
      />,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-describedby",
      "make-desc",
    );
  });

  it("keeps aria-expanded false when closed", () => {
    render(<VehicleAttributeAutocomplete endpoint="/vehicle-makes" name="make" />);
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
