import gql from 'graphql-tag';

/**
 * The module's GraphQL API, as the administration screen uses it.
 *
 * Everything hangs off the single `topPages` field on the root Query/Mutation - see
 * TopPagesQueryExtension on the Java side for why a module must not add flat root fields.
 *
 * `graphql-tag` rather than the `gql` re-export of @apollo/client, because the app shell shares
 * graphql-tag in the federation scope: importing it from there keeps the graphql parser out of
 * this bundle entirely.
 */

const REPORT_CONFIGURATION_FIELDS = gql`
    fragment ReportConfigurationFields on TopPagesReportConfiguration {
        name
        awStatsUrl
        includeFilter
        excludeFilter
        titleFromHTML
        titleSeparator
    }
`;

export const GET_REPORT_CONFIGURATIONS = gql`
    query getTopPagesReportConfigurations {
        topPages {
            reportConfigurations {
                ...ReportConfigurationFields
            }
        }
    }
    ${REPORT_CONFIGURATION_FIELDS}
`;

export const GET_CONTENT_NODES = gql`
    query getTopPagesContentNodes {
        topPages {
            contentNodes {
                name
                path
                reportConfiguration
                lastPublished
                parentPage
                defaultLanguage
            }
        }
    }
`;

export const CREATE_REPORT_CONFIGURATION = gql`
    mutation createTopPagesReportConfiguration(
        $name: String!
        $awStatsUrl: String!
        $includeFilter: String
        $excludeFilter: String
        $titleFromHTML: Boolean
        $titleSeparator: String
    ) {
        topPages {
            createReportConfiguration(
                name: $name
                awStatsUrl: $awStatsUrl
                includeFilter: $includeFilter
                excludeFilter: $excludeFilter
                titleFromHTML: $titleFromHTML
                titleSeparator: $titleSeparator
            ) {
                ...ReportConfigurationFields
            }
        }
    }
    ${REPORT_CONFIGURATION_FIELDS}
`;

export const UPDATE_REPORT_CONFIGURATION = gql`
    mutation updateTopPagesReportConfiguration(
        $name: String!
        $newName: String
        $awStatsUrl: String
        $includeFilter: String
        $excludeFilter: String
        $titleFromHTML: Boolean
        $titleSeparator: String
    ) {
        topPages {
            updateReportConfiguration(
                name: $name
                newName: $newName
                awStatsUrl: $awStatsUrl
                includeFilter: $includeFilter
                excludeFilter: $excludeFilter
                titleFromHTML: $titleFromHTML
                titleSeparator: $titleSeparator
            ) {
                ...ReportConfigurationFields
            }
        }
    }
    ${REPORT_CONFIGURATION_FIELDS}
`;

export const DELETE_REPORT_CONFIGURATION = gql`
    mutation deleteTopPagesReportConfiguration($name: String!) {
        topPages {
            deleteReportConfiguration(name: $name)
        }
    }
`;
