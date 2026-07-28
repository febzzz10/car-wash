import VehicleAttributeAutocomplete from "./vehicle-attribute-autocomplete";

interface VehicleMakeAutocompleteProps {
  readonly "aria-describedby"?: string;
  readonly className?: string;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly maxLength?: number;
  readonly name: string;
  readonly onBlur?: () => void;
  readonly onChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly value?: string;
}

export default function VehicleMakeAutocomplete(props: VehicleMakeAutocompleteProps) {
  return <VehicleAttributeAutocomplete {...props} endpoint="/vehicle-makes" />;
}
