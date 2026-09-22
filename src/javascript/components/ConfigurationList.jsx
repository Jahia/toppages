import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Chip, Delete, Edit, Typography} from '@jahia/moonstone';

const COLUMNS = ['name', 'awStatsUrl', 'includeFilter', 'excludeFilter', 'titleFromHTML', 'titleSeparator'];

const EMPTY_CELL = '—';

/**
 * The stored report configurations, and what can be done to each of them.
 *
 * Deleting asks first, and asks inside the page rather than through window.confirm(): a native
 * dialog cannot say which configuration is about to go in the same visual language as the row it
 * came from, and it is the one piece of UI a test cannot see.
 */
export const ConfigurationList = ({configurations, onEdit, onDelete}) => {
    const {t} = useTranslation('toppages');
    const [pendingDeletion, setPendingDeletion] = useState(null);

    if (configurations.length === 0) {
        return (
            <div className="toppages-empty" data-sel-role="empty-state">
                <Typography variant="subheading" component="p">{t('settings.configurations.empty')}</Typography>
                <Typography variant="body">{t('settings.configurations.emptyHint')}</Typography>
            </div>
        );
    }

    return (
        <table className="toppages-table" data-sel-role="configuration-table">
            <thead>
                <tr>
                    {COLUMNS.map(column => (
                        <th key={column} scope="col">
                            <Typography variant="caption" weight="semiBold" isUpperCase>
                                {t(`settings.field.${column}.label`)}
                            </Typography>
                        </th>
                    ))}
                    <th scope="col">
                        <Typography variant="caption" weight="semiBold" isUpperCase>
                            {t('settings.configurations.actions')}
                        </Typography>
                    </th>
                </tr>
            </thead>
            <tbody>
                {configurations.map(configuration => (
                    <React.Fragment key={configuration.name}>
                        <tr data-sel-role={`configuration-row-${configuration.name}`}>
                            <th scope="row">
                                <Typography variant="body" weight="semiBold">{configuration.name}</Typography>
                            </th>
                            <td className="toppages-table__url">{configuration.awStatsUrl || EMPTY_CELL}</td>
                            <td>{configuration.includeFilter || EMPTY_CELL}</td>
                            <td>{configuration.excludeFilter || EMPTY_CELL}</td>
                            <td>
                                <Chip
                                    label={String(configuration.titleFromHTML)}
                                    color={configuration.titleFromHTML ? 'accent' : 'default'}
                                />
                            </td>
                            <td>{configuration.titleSeparator || EMPTY_CELL}</td>
                            <td className="toppages-table__actions">
                                <Button
                                    data-sel-role={`edit-${configuration.name}`}
                                    variant="ghost"
                                    icon={<Edit/>}
                                    label={t('settings.configurations.edit')}
                                    onClick={() => onEdit(configuration)}
                                />
                                <Button
                                    data-sel-role={`delete-${configuration.name}`}
                                    variant="ghost"
                                    color="danger"
                                    icon={<Delete/>}
                                    label={t('settings.configurations.delete')}
                                    onClick={() => setPendingDeletion(configuration.name)}
                                />
                            </td>
                        </tr>
                        {pendingDeletion === configuration.name && (
                            <tr className="toppages-table__confirm" data-sel-role="delete-confirmation">
                                <td colSpan={COLUMNS.length + 1}>
                                    <Typography variant="body" weight="semiBold">
                                        {t('settings.configurations.confirmDelete', {name: configuration.name})}
                                    </Typography>
                                    <div className="toppages-table__confirm-actions">
                                        <Button
                                            data-sel-role="confirm-delete"
                                            color="danger"
                                            label={t('settings.configurations.confirmDeleteYes')}
                                            onClick={() => {
                                                setPendingDeletion(null);
                                                onDelete(configuration.name);
                                            }}
                                        />
                                        <Button
                                            data-sel-role="cancel-delete"
                                            variant="outlined"
                                            label={t('settings.form.cancel')}
                                            onClick={() => setPendingDeletion(null)}
                                        />
                                    </div>
                                </td>
                            </tr>
                        )}
                    </React.Fragment>
                ))}
            </tbody>
        </table>
    );
};
