import { join } from 'path';

function getHmrString(appName, routerPath, container = '#root') {
  return `
(function() {
  // Generated by babel-plugin-dva-hmr
  console.log('[HMR] inited with babel-plugin-dva-hmr');
  ${appName}.router(require('${routerPath}'));
  ${appName}.use({
    onHmr(render) {
      if (module.hot) {
        const renderNormally = render;
        const renderException = (error) => {
          const RedBox = require('redbox-react');
          ReactDOM.render(React.createElement(RedBox, { error: error }), document.querySelector('${container}'));
        };
        const newRender = (router) => {
          try {
            renderNormally(router);
          } catch (error) {
            console.error('error', error);
            renderException(error);
          }
        };
        module.hot.accept('${routerPath}', () => {
          const router = require('${routerPath}');
          newRender(router);
        });
      }
    },  
  });
})()
    `;
}

export default function ({ types:t }) {
  const cache = {};

  function isDvaCallExpression(node) {
    return t.isCallExpression(node) &&
        t.isIdentifier(node.callee) &&
        node.callee.name === 'dva';
  }

  function isDvaInstance(identifierName, scope) {
    if (scope.hasBinding(identifierName)) {
      const binding = scope.bindings[identifierName];
      const parent = binding.path.parent;
      if (t.isVariableDeclaration(parent)) {
        const declarator = findDeclarator(parent.declarations, identifierName);
        if (declarator && isDvaCallExpression(declarator.init)) {
          return true;
        }
      }
    }
    return false;
  }

  function isRouterCall(node, scope) {
    if (!t.isMemberExpression(node)) return false;
    const { object, property } = node;
    return (
      ( t.isIdentifier(object) && isDvaInstance(object.name, scope)) &&
      ( t.isIdentifier(property) && property.name === 'router' )
    );
  }

  function isRequire(node) {
    return t.isCallExpression(node) &&
        t.isIdentifier(node.callee) &&
        node.callee.name === 'require';
  }

  function findDeclarator(declarations, identifier) {
    for (let d of declarations) {
      if (t.isIdentifier(d.id) && d.id.name === identifier) {
        return d;
      }
    }
  }

  function getRouterPath(node, scope, filename) {
    switch (node.type) {
      case 'CallExpression':
        if (t.isLiteral(node.arguments[0])) {
          return node.arguments[0].value;
        }
        break;
      case 'Identifier':
        if (scope.hasBinding(node.name)) {
          const binding = scope.bindings[node.name];
          const parent = binding.path.parent;

          if (t.isImportDeclaration(parent)) {
            return parent.source.value;
          } else if (t.isVariableDeclaration(parent)) {
            const declarator = findDeclarator(parent.declarations, node.name);
            if (declarator && isRequire(declarator.init)) {
              return declarator.init.arguments[0].value;
            }
          }
        }
        break;
      default:
        break;
    }
    !opts.quiet && console.warn(`[babel-plugin-dva-hmr][WARN] can't get router path in ${filename}`);
  }

  return {
    visitor: {
      CallExpression(path, { opts }) {
        const { filename } = path.hub.file.opts;
        if (cache[filename]) return;
        const { callee, arguments: args } = path.node;
        if (isRouterCall(callee, path.scope)) {
          const routerPath = getRouterPath(args[0], path.scope, filename);
          if (routerPath) {
            cache[filename] = true;
            !opts.quiet && console.info(`[babel-plugin-dva-hmr][INFO] got routerPath ${routerPath}`);
            path.parentPath.replaceWithSourceString(getHmrString(callee.object.name, routerPath, opts.container));
          }
        }
      },
    },
  };
}
