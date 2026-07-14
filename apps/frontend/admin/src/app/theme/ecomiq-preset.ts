import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Ecomiq brand theme preset.
 *
 * Layers the Behance case-study brand palette on top of PrimeNG's Aura preset so
 * that every PrimeNG component (buttons, focus rings, checkboxes, toggles, tags,
 * active states, links) picks up the brand orange automatically instead of the
 * default Aura emerald. Also standardises the shared form-field metrics so every
 * control (p-select, p-multiselect, p-inputtext, p-datepicker, p-textarea) shares
 * the same height, radius and focus treatment.
 *
 * Brand reference (ECOMIQ-ANALYSIS-AND-PLAN.md §1.2):
 *   Primary Orange #F16D22 · dark navy-black #0D0D1C · AI gradient #6422F1→#B133DE→#7433DE
 */
export const EcomiqPreset = definePreset(Aura, {
  semantic: {
    // Brand orange ramp — #F16D22 is the 500 (brand) stop.
    primary: {
      50: '#fff3ec',
      100: '#fee1ce',
      200: '#fcc29d',
      300: '#f9a06b',
      400: '#f5843f',
      500: '#f16d22',
      600: '#d95a15',
      700: '#b44711',
      800: '#8f3813',
      900: '#742f13',
      950: '#3f1607',
    },
    // Consistent — and compact — form-field geometry across all input-like
    // components. The screens use small (text-xs/13px) controls, so keep the
    // vertical padding tight; the shared height is pinned in styles.css.
    formField: {
      paddingX: '0.75rem',
      paddingY: '0.375rem',
      sm: {
        fontSize: '0.8125rem',
        paddingX: '0.625rem',
        paddingY: '0.3125rem',
      },
      borderRadius: '8px',
      focusRing: {
        width: '2px',
        style: 'solid',
        color: '{primary.color}',
        offset: '0',
        shadow: 'none',
      },
    },
    // Tighter dropdown/list option rows so overlays don't feel oversized.
    list: {
      padding: '0.25rem 0.25rem',
      gap: '2px',
      option: {
        padding: '0.375rem 0.625rem',
        borderRadius: '6px',
      },
    },
    focusRing: {
      width: '2px',
      style: 'solid',
      color: '{primary.color}',
      offset: '2px',
      shadow: 'none',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.500}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.600}',
          activeColor: '{primary.700}',
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.700}',
          focusColor: '{primary.800}',
        },
        formField: {
          borderColor: '{surface.200}',
          hoverBorderColor: '{surface.300}',
          focusBorderColor: '{primary.color}',
        },
      },
    },
  },
});
