export function CitySelect({ value, onChange, ...props }: any) { return <input value={value} onChange={(e) => onChange?.(e.target.value)} {...props} />; }
