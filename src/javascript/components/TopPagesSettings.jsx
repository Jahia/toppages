import React, {useState} from 'react';
import {useMutation, useQuery} from '@apollo/client';
import {useTranslation} from 'react-i18next';
import {Add, Button, Loader, Typography} from '@jahia/moonstone';

import {
    CREATE_REPORT_CONFIGURATION,
    DELETE_REPORT_CONFIGURATION,
    GET_REPORT_CONFIGURATIONS,
    UPDATE_REPORT_CONFIGURATION
} from '../gql/topPages.gql';
import {ConfigurationForm} from './ConfigurationForm';
import {ConfigurationList} from './ConfigurationList';
import {ContentNodeList} from './ContentNodeList';
import {Banner} from './Banner';
import './topPages.css';

/**
 * Administration > Server > Configuration > Top Pages.
 *
 * The screen is a small state machine with three states - the list, the creation form and the
 * edition form - because that is what the page it replaces did, and because an inline-editable
 * table would make "rename" (which moves a JCR node) look like an ordinary field edit.
 *
 * Every write goes through the module's GraphQL API and is followed by a refetch rather than a
 * cache update: the server rewrites what it stored (it normalises the five properties, and a
 * rename moves the node), so the truth is what reading it back says, not what was sent.
 */
export const TopPagesSettings = () => {
    const {t} = useTranslation('toppages');

    // null = the list; {} = creating; {name, ...} = editing that configuration.
    const [edited, setEdited] = useState(null);
    const [error, setError] = useState(null);

    const {data, loading, error: queryError, refetch} = useQuery(GET_REPORT_CONFIGURATIONS, {
        fetchPolicy: 'network-only'
    });

    const [createConfiguration] = useMutation(CREATE_REPORT_CONFIGURATION);
    const [updateConfiguration] = useMutation(UPDATE_REPORT_CONFIGURATION);
    const [deleteConfiguration] = useMutation(DELETE_REPORT_CONFIGURATION);

    const configurations = data?.topPages?.reportConfigurations ?? [];

    /**
     * Run one write, then go back to the list only if it succeeded.
     *
     * A refused write must leave the operator on the form with their input intact - that is the
     * whole point of the server reporting "this name is taken" rather than dropping it. Both
     * failure shapes are handled: Apollo rejects on a network error and, for a GraphQL error,
     * either rejects or resolves with `errors` depending on the error policy in force.
     */
    const runWrite = async mutate => {
        setError(null);
        try {
            const result = await mutate();
            if (result?.errors?.length || !result?.data) {
                setError(result?.errors?.[0]?.message ?? t('settings.error.unknown'));
                return false;
            }

            await refetch();
            return true;
        } catch (e) {
            setError(e.message);
            return false;
        }
    };

    const handleSave = async values => {
        const saved = await runWrite(() => createConfiguration({variables: values}));
        if (saved) {
            setEdited(null);
        }
    };

    const handleUpdate = async values => {
        const {name, ...rest} = values;
        const saved = await runWrite(() => updateConfiguration({
            variables: {name: edited.name, newName: name, ...rest}
        }));
        if (saved) {
            setEdited(null);
        }
    };

    const handleDelete = async name => {
        await runWrite(() => deleteConfiguration({variables: {name}}));
    };

    return (
        <main className="toppages-settings" data-sel-role="toppages-settings">
            <header className="toppages-settings__header">
                <Typography isNowrap variant="title" component="h1">
                    {t('settings.title')}
                </Typography>
                <Typography variant="body" className="toppages-settings__lead">
                    {t('settings.lead')}
                </Typography>
            </header>

            {error && (
                <Banner variant="error" dataSelRole="error-message" onClose={() => setError(null)}>
                    {error}
                </Banner>
            )}

            {queryError && (
                <Banner variant="error" dataSelRole="query-error-message">
                    {queryError.message}
                </Banner>
            )}

            <section className="toppages-card" aria-labelledby="toppages-configurations-heading">
                <div className="toppages-card__head">
                    <Typography id="toppages-configurations-heading" variant="heading" component="h2">
                        {t('settings.configurations.title')}
                    </Typography>
                    {edited === null && (
                        <Button
                            data-sel-role="add-configuration"
                            size="big"
                            color="accent"
                            label={t('settings.configurations.add')}
                            icon={<Add/>}
                            onClick={() => {
                                setError(null);
                                setEdited({});
                            }}
                        />
                    )}
                </div>

                <Typography variant="body" className="toppages-card__lead">
                    {t('settings.configurations.description')}
                </Typography>

                {loading && <Loader size="big"/>}

                {!loading && edited === null && (
                    <ConfigurationList
                        configurations={configurations}
                        onEdit={configuration => {
                            setError(null);
                            setEdited(configuration);
                        }}
                        onDelete={handleDelete}
                    />
                )}

                {edited !== null && (
                    <ConfigurationForm
                        configuration={edited}
                        onSubmit={edited.name ? handleUpdate : handleSave}
                        onCancel={() => {
                            setError(null);
                            setEdited(null);
                        }}
                    />
                )}
            </section>

            <ContentNodeList/>
        </main>
    );
};
