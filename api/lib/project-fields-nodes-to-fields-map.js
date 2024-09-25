// @ts-check

import { GitHubProjectUnknownFieldError } from "../../index.js";

/**
 * Takes `project.fields` and the list of project item fieldValues nodes
 * from the GraphQL query result:
 *
 * ```
 * fieldValues(...) {
 *   nodes {
 *     id
 *     name
 *     settings
 *   }
 * }
 * ```
 *
 * and turns them into a map
 *
 * ```
 * {
 *   "title": {
 *     "id": "<project field node id 1>",
 *     "name": "Title",
 *   },
 *   "status": {
 *     "id": "<project field node id 2>",
 *     "name": "Status",
 *     "optionsByValue": {
 *       "In Progress": "<option node id 1>",
 *       "Ready": "<option node id 2>",
 *       "Done": "<option node id 3>",
 *     },
 *     "optionsById": {
 *       "<option node id 1>": "In Progress",
 *       "<option node id 2>": "Ready",
 *       "<option node id 3>": "Done",
 *     },
 *   },
 *   "myCustomField": {
 *     "id": "<project field node id 3>",
 *     "name": "My Custom Field",
 *   },
 * }
 * ```
 *
 * @param {import("../..").GitHubProjectState} state
 * @param {import("../..").default} project
 * @param {import("../..").ProjectFieldNode[]} nodes
 *
 * @returns {import("../..").ProjectFieldMap}
 */
export function projectFieldsNodesToFieldsMap(state, project, nodes) {
  const optionalFields = Object.entries(project.fields).reduce(
    (acc, [key, value]) => {
      if (typeof value === "string") return acc;

      if (!value.optional) return acc;

      return {
        ...acc,
        [key]: { userName: value.name, optional: true, existsInProject: false },
      };
    },
    {}
  );

  return Object.entries(project.fields).reduce(
    (acc, [userFieldNameAlias, userFieldNameOrConfig]) => {
      let fieldOptional = false;
      let userFieldName = userFieldNameOrConfig;
      if (typeof userFieldNameOrConfig === "object") {
        fieldOptional = userFieldNameOrConfig.optional;
        userFieldName = userFieldNameOrConfig.name;
      }

      const node = nodes.find((node) =>
        state.matchFieldName(
          node.name.toLowerCase(),
          userFieldName.toLowerCase().trim()
        )
      );

      if (!node) {
        const projectFieldNames = nodes.map((node) => node.name);
        if (!fieldOptional) {
          throw new GitHubProjectUnknownFieldError({
            userFieldName,
            userFieldNameAlias,
            projectFieldNames,
          });
        }
        project.octokit.log.info(
          `optional field "${userFieldName}" was not matched with any existing field names: ${projectFieldNames}`
        );
        return acc;
      }

      acc[userFieldNameAlias] = {
        id: node.id,
        name: node.name,
        dataType: node.dataType,
        userName: userFieldName,
        optional: userFieldNameAlias in optionalFields,
        existsInProject: true,
      };

      // Settings is a JSON string. It contains view information such as column width.
      // If the field is of type "Single select", then the `options` property will be set.
      if (node.options) {
        acc[userFieldNameAlias].optionsById = node.options.reduce(
          (acc, option) => {
            return {
              ...acc,
              [option.id]: option.name,
            };
          },
          {}
        );
        acc[userFieldNameAlias].optionsByValue = node.options.reduce(
          (acc, option) => {
            return {
              ...acc,
              [option.name]: option.id,
            };
          },
          {}
        );
      }

      // If the field is of type "Iteration", then the `configuration` property will be set.
      if (node.configuration) {
        acc[userFieldNameAlias].optionsById = node.configuration.iterations.concat(node.configuration.completedIterations).reduce(
          (acc, option) => {
            return {
              ...acc,
              [option.id]: option.title,
            };
          },
          {}
        );
        acc[userFieldNameAlias].optionsByValue = node.configuration.iterations.concat(node.configuration.completedIterations).reduce(
          (acc, option) => {
            return {
              ...acc,
              [option.title]: option.id,
            };
          },
          {}
        );
        acc[userFieldNameAlias].configuration = node.configuration;
      }

      return acc;
    },
    optionalFields
  );
}
