import { actionDeleteRelation } from './delete_relation';
import { actionDeleteWay } from './delete_way';
import { geoSphericalDistance } from '../geo';


// https://github.com/openstreetmap/potlatch2/blob/master/net/systemeD/halcyon/connection/actions/DeleteNodeAction.as
export function actionDeleteNode(nodeId) {

    function adjustParentWaysToMaintainRelationConnections(graph) {

        function idOfNodeAdjacentToDeletingNode(way) {
            return way.nodes[way.first() === nodeId ? 1 : way.nodes.length - 2];
        }

        var node = graph.entity(nodeId);

        var wayIdsToAdjust = [];
        var minDistance = Number.MAX_VALUE;

        function queueForEndpointAdjustment(wayId) {

            if (wayIdsToAdjust.indexOf(wayId) !== -1) return;

            var way = graph.entity(wayId);
            var candidateNodeId = idOfNodeAdjacentToDeletingNode(way);
            var distance = geoSphericalDistance(graph.entity(candidateNodeId).loc, node.loc);
            if (distance < minDistance) {
                minDistance = distance;
                wayIdsToAdjust.unshift(wayId);
            } else {
                wayIdsToAdjust.push(wayId);
            }
        }

        var waysByRelationId = {};

        graph.parentWays(node).forEach(function(parentWay) {
            if (parentWay.isClosed()) return;
            if (parentWay.first() !== nodeId && parentWay.last() !== nodeId) return;

            graph.parentRelations(parentWay).forEach(function(parentRelation) {
                if (!waysByRelationId[parentRelation.id]) {
                    if (parentRelation.isMultipolygon() || parentRelation.tags.type === 'route') {
                        waysByRelationId[parentRelation.id] = parentWay.id;
                    }
                } else {
                    // this node joins multiple ways of this route or multipolygon relation
                    queueForEndpointAdjustment(waysByRelationId[parentRelation.id]);
                    queueForEndpointAdjustment(parentWay.id);
                }
            });
        });

        if (wayIdsToAdjust.length <= 1) return graph;

        var way0 = graph.entity(wayIdsToAdjust.shift());
        var replacementNode = idOfNodeAdjacentToDeletingNode(way0);
        wayIdsToAdjust.forEach(function(wayId) {
            var way1 = graph.entity(wayId);
            var toIndex = way1.first() === nodeId ? 0 : way1.nodes.length - 1;
            way1 = way1.updateNode(replacementNode, toIndex);
            graph = graph.replace(way1);
        });

        return graph;
    }

    var action = function(graph) {

        graph = adjustParentWaysToMaintainRelationConnections(graph);

        var node = graph.entity(nodeId);

        graph.parentWays(node)
            .forEach(function(parent) {
                parent = parent.removeNode(nodeId);
                graph = graph.replace(parent);

                if (parent.isDegenerate()) {
                    graph = actionDeleteWay(parent.id)(graph);
                }
            });

        graph.parentRelations(node)
            .forEach(function(parent) {
                parent = parent.removeMembersWithID(nodeId);
                graph = graph.replace(parent);

                if (parent.isDegenerate()) {
                    graph = actionDeleteRelation(parent.id)(graph);
                }
            });

        return graph.remove(node);
    };


    return action;
}
