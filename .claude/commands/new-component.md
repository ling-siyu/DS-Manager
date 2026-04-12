Create a new UI component that strictly follows the design system.

## What this command does

You are a design system-aware React component builder. Your job is to scaffold a new component that uses only design tokens and integrates with the existing component registry.

## Instructions

1. **Check the registry first** — read `design-system/components.json`. If a component that satisfies the requirement already exists (even partially), use it instead of creating a new one. Components with `"doNotCreate": true` must never be duplicated.

2. **Read `design-system/context.md`** to understand available tokens and component conventions.

3. **Determine component requirements** from the user's request:
   - What does it render?
   - What variants/sizes should it support?
   - What props does it need?
   - What state does it manage (hover, focus, disabled, loading, error...)?

4. **Scaffold the component** following these rules:
   - **File location:** `src/components/ui/<ComponentName>.tsx` for primitives, `src/components/features/` for feature-specific
   - **Styling:** Use Tailwind classes with CSS variable values (`bg-[var(--ds-semantic-color-interactive-primary-bg)]`) OR use `cn()` utility with semantic classes
   - **Never** hardcode colors, spacing, or typography values
   - **Token usage:** Use `component.*` tokens for component-specific sizing, `semantic.*` for colors
   - **Variants:** implement via a `variant` prop mapped through a lookup object (not ternary chains)
   - **Accessibility:** include `aria-*` attributes, keyboard interaction, and focus rings using `--ds-semantic-color-border-focus`
   - **TypeScript:** export prop types as a named interface `<ComponentName>Props`

5. **Component structure template:**

```tsx
import { forwardRef } from 'react';
import { cn } from '@/lib/utils'; // adjust to your cn utility path

export interface MyComponentProps {
  variant?: 'default' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  // ...other props
  className?: string;
  children: React.ReactNode;
}

const variantStyles = {
  default:   'bg-[var(--ds-semantic-color-interactive-primary-bg)] text-[var(--ds-semantic-color-interactive-primary-text)]',
  secondary: 'bg-[var(--ds-semantic-color-interactive-secondary-bg)] text-[var(--ds-semantic-color-interactive-secondary-text)]',
} as const;

const sizeStyles = {
  sm: 'h-[var(--ds-component-button-height-sm)] px-[var(--ds-component-button-paddingX-sm)] text-[length:var(--ds-component-button-fontSize-sm)]',
  md: 'h-[var(--ds-component-button-height-md)] px-[var(--ds-component-button-paddingX-md)] text-[length:var(--ds-component-button-fontSize-md)]',
  lg: 'h-[var(--ds-component-button-height-lg)] px-[var(--ds-component-button-paddingX-lg)] text-[length:var(--ds-component-button-fontSize-lg)]',
} as const;

export const MyComponent = forwardRef<HTMLDivElement, MyComponentProps>(
  ({ variant = 'default', size = 'md', className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
MyComponent.displayName = 'MyComponent';
```

6. **After writing the component**, add it to `design-system/components.json` under the `components` array with:
   - `name`, `path`, `description`, `variants`, `sizes`, `props`, `tokens`, `status: "draft"`

7. **Remind the user** to run `cd design-system && node src/cli.js generate-context` to regenerate CLAUDE.md.

## Important

- Components must be self-contained and work without runtime token resolution (CSS variables are resolved by the browser at paint time)
- Always test your variant/size coverage — every combination should render without errors
- Prefer `forwardRef` for all leaf-node components (buttons, inputs, etc.)
