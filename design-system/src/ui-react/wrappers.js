import React from 'react';

function isRenderableNode(value) {
  if (value == null) return true;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  if (React.isValidElement(value)) return true;
  if (Array.isArray(value)) return value.every(isRenderableNode);
  return false;
}

function hasRenderableChildrenObject(value) {
  return Boolean(value && React.isValidElement(value.children));
}

function resolveWrapperComponent(value) {
  if (!value || typeof value !== 'object') return null;

  return value.wrapper || value.component || value.Provider || value.provider || null;
}

export function normalizeWrappedOutput(value, fallback, label) {
  if (typeof value === 'function') {
    return React.createElement(value, null, fallback);
  }

  if (isRenderableNode(value)) {
    return value;
  }

  const wrapperComponent = resolveWrapperComponent(value);
  if (wrapperComponent) {
    const wrapperProps = value.props && typeof value.props === 'object' ? value.props : {};
    const wrapperChildren = value.children ?? fallback;
    return React.createElement(wrapperComponent, wrapperProps, wrapperChildren);
  }

  if (hasRenderableChildrenObject(value)) {
    return value.children;
  }

  if (value && typeof value === 'object' && 'children' in value) {
    return value.children ?? fallback;
  }

  throw new Error(`${label} must return a renderable React node.`);
}

export function applyProviders(adapter, child, componentName, props) {
  if (typeof adapter?.renderProviders !== 'function') return child;

  const wrapped = adapter.renderProviders({ children: child, componentName, props });
  return normalizeWrappedOutput(wrapped, child, 'adapter.renderProviders');
}

export function applyDecorators(adapter, child, componentName, props) {
  if (!Array.isArray(adapter?.decorators)) return child;

  return adapter.decorators.reduce((output, decorator) => {
    if (typeof decorator !== 'function') return output;

    const context = { children: output, componentName, props };
    const story = () => output;
    let wrapped = decorator.length >= 2 ? decorator(story, context) : decorator(context);

    if (!isRenderableNode(wrapped) && !hasRenderableChildrenObject(wrapped) && decorator.length < 2) {
      wrapped = decorator(story, context);
    }

    return normalizeWrappedOutput(wrapped, output, 'Preview decorator');
  }, child);
}
