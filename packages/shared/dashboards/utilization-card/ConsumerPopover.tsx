import * as React from 'react';
import {
  Humanize,
  K8sKind,
  K8sResourceCommon,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { usePrometheusPoll } from '@openshift-console/dynamic-plugin-sdk-internal';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  PopoverPosition,
  Popover,
  Button,
  Dropdown,
  ListItem,
} from '@patternfly/react-core';
import { getName, getNamespace } from '../../selectors';
import {
  DataPoint,
  getInstantVectorStats,
  referenceForModel,
  resourcePathFromModel,
} from '../../utils';

export type ConsumerPopoverProps = PopoverProps & {
  position?: PopoverPosition;
  title: string;
  current: string;
  namespace: string;
  humanize: any;
  description: any;
  consumers?: any;
};

const ConsumerPopover: React.FC<ConsumerPopoverProps> = React.memo(
  ({
    current,
    title,
    humanize,
    consumers,
    namespace,
    position = PopoverPosition.top,
    description,
    children,
  }) => {
    const { t } = useTranslation();
    const [isOpen, setOpen] = React.useState(false);
    const onShow = React.useCallback(() => setOpen(true), []);
    const onHide = React.useCallback(() => setOpen(false), []);
    if (!current) {
      return null;
    }
    return (
      <Popover
        position={position}
        headerContent={t('{{title}} breakdown', { title })}
        bodyContent={
          <PopoverBody
            humanize={humanize}
            consumers={consumers}
            namespace={namespace}
            isOpen={isOpen}
            description={description}
          >
            {children}
          </PopoverBody>
        }
        enableFlip
        onShow={onShow}
        onHide={onHide}
        maxWidth="21rem"
      >
        <Button variant="link" isInline>
          {current}
        </Button>
      </Popover>
    );
  }
);

type PopoverProps = {
  humanize: Humanize;
  consumers: {
    model: K8sKind;
    query: string;
    metric: string;
    fieldSelector?: string;
  }[];
  namespace?: string;
  description?: string;
};

type PopoverBodyProps = PopoverProps & {
  topConsumers?: DataPoint[][];
  error?: boolean;
  isOpen: boolean;
  humanize: Humanize;
};

const getResourceToWatch = (
  model: K8sKind,
  namespace: string,
  fieldSelector: string
) => ({
  isList: true,
  kind: model.crd ? referenceForModel(model) : model.kind,
  fieldSelector,
  namespace,
});

export const PopoverBody: React.FC<PopoverBodyProps> = React.memo(
  ({ humanize, consumers, namespace, isOpen, description, children }) => {
    const { t } = useTranslation();
    const [currentConsumer, setCurrentConsumer] = React.useState(consumers[0]);
    const { query, model, metric, fieldSelector } = currentConsumer;
    const k8sResource = React.useMemo(
      () =>
        isOpen ? getResourceToWatch(model, namespace, fieldSelector) : null,
      [fieldSelector, isOpen, model, namespace]
    );
    const [consumerData, consumerLoaded, consumersLoadError] =
      useK8sWatchResource<K8sResourceCommon[]>(k8sResource);

    const [metrics, metricsError, metricsLoading] = isOpen
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        usePrometheusPoll({
          endpoint: 'api/v1/query' as any,
          query,
          namespace,
        })
      : [null, null, false];

    const top5Data = [];

    const bodyData = getInstantVectorStats(metrics, metric);

    if (k8sResource && consumerLoaded && !consumersLoadError) {
      for (const d of bodyData) {
        const consumerExists = consumerData.some(
          (consumer) =>
            getName(consumer) === d.metric[metric] &&
            (model.namespaced
              ? getNamespace(consumer) === d.metric.namespace
              : true)
        );
        if (consumerExists) {
          top5Data.push({ ...d, y: humanize(d.y).string });
        }
        if (top5Data.length === 5) {
          break;
        }
      }
    }

    const monitoringParams = React.useMemo(() => {
      const params = new URLSearchParams();
      params.set('query0', currentConsumer.query);
      return params;
    }, [currentConsumer.query]);

    const dropdownItems = React.useMemo(
      () =>
        consumers.reduce((items, curr) => {
          items[referenceForModel(curr.model)] = t(
            'By {{label}}',
            {
              label: curr.model.labelKey
                ? t(curr.model.labelKey)
                : curr.model.label,
            }
          );
          return items;
        }, {}),
      [consumers, t]
    );

    const onDropdownChange = React.useCallback(
      (key) =>
        setCurrentConsumer(
          consumers.find((c) => referenceForModel(c.model) === key)
        ),
      [consumers]
    );

    const monitoringURL = `/monitoring/query-browser?${monitoringParams.toString()}`;

    let body: React.ReactNode;
    if (metricsError || consumersLoadError) {
      body = (
        <div className="text-secondary">
          {t('Not available')}
        </div>
      );
    } else if (!consumerLoaded || metricsLoading) {
      body = (
        <ul className="co-utilization-card-popover__consumer-list">
          <li className="skeleton-consumer" />
          <li className="skeleton-consumer" />
          <li className="skeleton-consumer" />
          <li className="skeleton-consumer" />
          <li className="skeleton-consumer" />
        </ul>
      );
    } else {
      body = (
        <>
          <ul
            className="co-utilization-card-popover__consumer-list"
            aria-label={t('Top consumer by {{label}}', {
              label: model.label,
            })}
          >
            {top5Data &&
              top5Data.map((item) => {
                const title = String(item.x);
                return (
                  <ListItem key={title} value={item.y}>
                    <Link
                      className="co-utilization-card-popover__consumer-name"
                      to={resourcePathFromModel(
                        model,
                        title,
                        item.metric.namespace
                      )}
                    >
                      {title}
                    </Link>
                  </ListItem>
                );
              })}
          </ul>
          <Link to={monitoringURL}>{t('View more')}</Link>
        </>
      );
    }

    return (
      <div className="co-utilization-card-popover__body">
        {description && (
          <div className="co-utilization-card-popover__description">
            {description}
          </div>
        )}
        {children}
        <div className="co-utilization-card-popover__title">
          {consumers.length === 1
            ? t('Top {{label}} consumers', {
                label: currentConsumer.model.label.toLowerCase(),
              })
            : t('Top consumers')}
        </div>
        {consumers.length > 1 && (
          <Dropdown
            className="co-utilization-card-popover__dropdown"
            id="consumer-select"
            name="selectConsumerType"
            aria-label={t('Select consumer type')}
            dropdownItems={[dropdownItems]}
            onSelect={onDropdownChange}
            toggle={<></>}
          />
        )}
        {body}
      </div>
    );
  }
);

ConsumerPopover.displayName = 'ConsumerPopover';
PopoverBody.displayName = 'PopoverBody';

export default ConsumerPopover;
