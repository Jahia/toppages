import React from 'react';
import {Button, Close, Typography} from '@jahia/moonstone';

/**
 * A message the operator has to read before carrying on - a refused write, mostly.
 *
 * `role="alert"` rather than a silently rendered box: a validation failure that only changes a
 * colour somewhere is a failure a screen-reader user never hears about.
 */
export const Banner = ({variant = 'error', dataSelRole, onClose, children}) => (
    <div className={`toppages-banner toppages-banner--${variant}`} role="alert" data-sel-role={dataSelRole}>
        <Typography variant="body" weight="semiBold" className="toppages-banner__text">
            {children}
        </Typography>
        {onClose && (
            <Button
                variant="ghost"
                size="small"
                icon={<Close/>}
                data-sel-role={dataSelRole ? `${dataSelRole}-close` : undefined}
                onClick={onClose}
            />
        )}
    </div>
);
