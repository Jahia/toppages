import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Checkbox, Input, Typography} from '@jahia/moonstone';

// Every label, hint and required-message lives under settings.field.<id>.*, because i18next
// splits a key on '.': a flat "name.hint" sibling of a string "name" is a key it can never find.
const FIELDS = [
    {id: 'name', required: true},
    {id: 'awStatsUrl', required: true},
    {id: 'includeFilter'},
    {id: 'excludeFilter'},
    {id: 'titleSeparator'}
];

const asString = value => value ?? '';

/**
 * Create or edit one report configuration.
 *
 * The same form does both, because they differ only in what is prefilled and in whether the
 * submitted name is a new node name or a rename. What it does NOT do is decide whether a name is
 * legal or already taken: that is the server's answer, reported back as a banner, and duplicating
 * the rule here would only mean two places to keep in step.
 *
 * It does refuse an empty name and an empty report URL before sending anything, which the two
 * @NotEmpty constraints on the old web flow form model used to do - not as a security measure,
 * but so that the operator is told which field is missing next to that field.
 */
export const ConfigurationForm = ({configuration, onSubmit, onCancel}) => {
    const {t} = useTranslation('toppages');
    const isEdit = Boolean(configuration.name);

    const [values, setValues] = useState({
        name: asString(configuration.name),
        awStatsUrl: asString(configuration.awStatsUrl),
        includeFilter: asString(configuration.includeFilter),
        excludeFilter: asString(configuration.excludeFilter),
        titleSeparator: asString(configuration.titleSeparator),
        titleFromHTML: Boolean(configuration.titleFromHTML)
    });
    const [missing, setMissing] = useState([]);

    const setValue = (id, value) => setValues(previous => ({...previous, [id]: value}));

    const handleSubmit = event => {
        event.preventDefault();

        const empty = FIELDS.filter(field => field.required && values[field.id].trim() === '')
            .map(field => field.id);
        setMissing(empty);
        if (empty.length > 0) {
            return;
        }

        onSubmit(values);
    };

    // The form's onSubmit carries Enter-in-a-field; the submit button calls the same handler
    // through onClick and stays a plain type="button", so the two paths never fire together.
    return (
        <form className="toppages-form" data-sel-role="configuration-form" onSubmit={handleSubmit}>
            <Typography variant="subheading" component="h3" className="toppages-form__title">
                {isEdit ? t('settings.form.edit', {name: configuration.name}) : t('settings.form.create')}
            </Typography>

            <div className="toppages-form__grid">
                {FIELDS.map(field => (
                    <div key={field.id} className="toppages-form__field">
                        <label htmlFor={field.id}>
                            <Typography variant="body" weight="semiBold">
                                {t(`settings.field.${field.id}.label`)}
                                {field.required && <span aria-hidden="true"> *</span>}
                            </Typography>
                        </label>
                        <Input
                            id={field.id}
                            data-sel-role={`field-${field.id}`}
                            value={values[field.id]}
                            variant="outlined"
                            size="big"
                            onChange={event => setValue(field.id, event.target.value)}
                        />
                        {missing.includes(field.id) ? (
                            <Typography
                                variant="caption"
                                className="toppages-form__error"
                                data-sel-role={`error-${field.id}`}
                            >
                                {t(`settings.field.${field.id}.required`)}
                            </Typography>
                        ) : (
                            <Typography variant="caption" className="toppages-form__hint">
                                {t(`settings.field.${field.id}.hint`)}
                            </Typography>
                        )}
                    </div>
                ))}

                <div className="toppages-form__field toppages-form__field--checkbox">
                    <Checkbox
                        id="titleFromHTML"
                        data-sel-role="field-titleFromHTML"
                        checked={values.titleFromHTML}
                        onChange={event => setValue('titleFromHTML', event.target.checked)}
                    />
                    <label htmlFor="titleFromHTML">
                        <Typography variant="body" weight="semiBold">{t('settings.field.titleFromHTML.label')}</Typography>
                        <Typography variant="caption" className="toppages-form__hint">
                            {t('settings.field.titleFromHTML.hint')}
                        </Typography>
                    </label>
                </div>
            </div>

            <div className="toppages-form__actions">
                <Button
                    data-sel-role="submit-configuration"
                    size="big"
                    color="accent"
                    label={isEdit ? t('settings.form.update') : t('settings.form.save')}
                    onClick={handleSubmit}
                />
                <Button
                    data-sel-role="cancel-configuration"
                    size="big"
                    variant="outlined"
                    label={t('settings.form.cancel')}
                    onClick={onCancel}
                />
            </div>
        </form>
    );
};
