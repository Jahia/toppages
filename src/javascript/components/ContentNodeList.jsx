import React from 'react';
import {useLazyQuery} from '@apollo/client';
import {useTranslation} from 'react-i18next';
import {Button, Loader, Typography} from '@jahia/moonstone';

import {GET_CONTENT_NODES} from '../gql/topPages.gql';

const EMPTY_CELL = '—';

/**
 * Build the edit URL of the page a Top Pages node is rendered in.
 *
 * Returns null when the node has no enclosing page - content under /sites/<site>/contents has no
 * jnt:page ancestor - because interpolating a null path produces /cms/edit/default/en/.html, a
 * link that looks usable and goes nowhere.
 */
const editUrl = node => {
    if (!node.parentPage) {
        return null;
    }

    const contextPath = window.contextJsParameters?.contextPath ?? '';
    return `${contextPath}/cms/edit/default/${node.defaultLanguage}${node.parentPage}.html`;
};

/**
 * "Show all Top Pages nodes": every jtopmix:topPages node in the repository, with the report it
 * reads and the page it sits on.
 *
 * Kept from the page this screen replaces, where it was the only way to answer "the component
 * renders nothing - which node is it, and is it even inside a page". It is a lazy query on
 * purpose: it runs a repository-wide JCR-SQL2 query, which is not something to do every time an
 * administrator opens the settings screen.
 */
export const ContentNodeList = () => {
    const {t} = useTranslation('toppages');
    const [loadNodes, {data, loading, error, called}] = useLazyQuery(GET_CONTENT_NODES, {
        fetchPolicy: 'network-only'
    });

    const nodes = data?.topPages?.contentNodes ?? [];

    return (
        <section className="toppages-card" aria-labelledby="toppages-nodes-heading">
            <div className="toppages-card__head">
                <Typography id="toppages-nodes-heading" variant="heading" component="h2">
                    {t('settings.nodes.title')}
                </Typography>
                <Button
                    data-sel-role="list-nodes"
                    size="big"
                    variant="outlined"
                    isLoading={loading}
                    label={t('settings.nodes.list')}
                    onClick={() => loadNodes()}
                />
            </div>

            <Typography variant="body" className="toppages-card__lead">
                {t('settings.nodes.description')}
            </Typography>

            {loading && <Loader size="big"/>}

            {error && (
                <Typography variant="body" className="toppages-form__error" data-sel-role="nodes-error">
                    {error.message}
                </Typography>
            )}

            {called && !loading && !error && (
                <div data-sel-role="node-listing">
                    {nodes.length === 0 ? (
                        <div className="toppages-empty" data-sel-role="node-listing-empty">
                            <Typography variant="subheading" component="p">{t('settings.nodes.empty')}</Typography>
                        </div>
                    ) : (
                        <table className="toppages-table">
                            <thead>
                                <tr>
                                    {['reportConfiguration', 'name', 'path', 'lastPublished', 'page'].map(column => (
                                        <th key={column} scope="col">
                                            <Typography variant="caption" weight="semiBold" isUpperCase>
                                                {t(`settings.nodes.column.${column}`)}
                                            </Typography>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {nodes.map(node => (
                                    <tr key={node.path} data-sel-role={`node-row-${node.name}`}>
                                        <td>{node.reportConfiguration || EMPTY_CELL}</td>
                                        <th scope="row">
                                            <Typography variant="body" weight="semiBold">{node.name}</Typography>
                                        </th>
                                        <td className="toppages-table__url">{node.path}</td>
                                        <td>{node.lastPublished || t('settings.nodes.notPublished')}</td>
                                        <td>
                                            {editUrl(node) ? (
                                                <a
                                                    href={editUrl(node)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    data-sel-role={`node-link-${node.name}`}
                                                >
                                                    {t('settings.nodes.viewPage')}
                                                </a>
                                            ) : (
                                                <Typography variant="caption">{t('settings.nodes.noPage')}</Typography>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </section>
    );
};
