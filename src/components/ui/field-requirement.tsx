/**
 * The muted “(required)” or “(optional)” hint after a form label, shown on
 * fields that open empty so it is clear which ones a form needs.
 */
export function FieldRequirement({ optional = false }: { optional?: boolean }) {
    return (
        <span
            className='field-requirement'
            data-requirement={optional ? 'optional' : 'required'}
        >
            {optional ? '(optional)' : '(required)'}
        </span>
    );
}
