'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useKnowledgeGraph } from '@/lib/hooks/use-obsidian'
import { useTranslation } from '@/lib/hooks/use-translation'
import { GraphNode, GraphEdge } from '@/lib/types/api'
import { ZoomIn, ZoomOut, Maximize2, Search, Layers, Eye, Clock, Hash, X, RefreshCw } from 'lucide-react'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <Skeleton className="w-full h-full" />
    </div>
  ),
})

interface KnowledgeGraphViewerProps {
  notebookId: string
  height?: number
}

interface GraphData {
  nodes: Array<{
    id: string
    title: string
    type: string
    tags?: string[]
    degree?: number
    centrality?: number
    x?: number
    y?: number
    vx?: number
    vy?: number
    fx?: number
    fy?: number
  }>
  links: Array<{
    source: string
    target: string
    type: string
    context?: string
    weight?: number
  }>
}

type ColorScheme = 'default' | 'tags' | 'degree'

const COLOR_SCHEMES = {
  default: {
    note: '#8b5cf6',
    tag: '#06b6d4',
    source: '#f59e0b',
  },
  tags: {
    'knowledge-graph': '#ef4444',
    'semantic-web': '#f97316',
    'data-modeling': '#eab308',
    'ai': '#22c55e',
    'machine-learning': '#14b8a6',
    'default': '#8b5cf6',
  },
  degree: {
    low: '#06b6d4',
    medium: '#8b5cf6',
    high: '#f59e0b',
    hub: '#ef4444',
  },
}

export function KnowledgeGraphViewer({ notebookId, height = 600 }: KnowledgeGraphViewerProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { data: graphData, isLoading, error, refetch, isFetching } = useKnowledgeGraph(notebookId)
  const graphRef = useRef<any>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTag, setFilterTag] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [colorScheme, setColorScheme] = useState<ColorScheme>('tags')
  const [showTags, setShowTags] = useState(true)
  const [showDegrees, setShowDegrees] = useState(true)

  const getNodeColor = useCallback((node: GraphNode, scheme: ColorScheme): string => {
    if (scheme === 'tags' && node.tags && node.tags.length > 0) {
      const tag = node.tags[0]
      return COLOR_SCHEMES.tags[tag as keyof typeof COLOR_SCHEMES.tags] || COLOR_SCHEMES.tags.default
    }
    if (scheme === 'degree') {
      const degree = node.degree || 0
      if (degree >= 5) return COLOR_SCHEMES.degree.hub
      if (degree >= 3) return COLOR_SCHEMES.degree.high
      if (degree >= 1) return COLOR_SCHEMES.degree.medium
      return COLOR_SCHEMES.degree.low
    }
    return COLOR_SCHEMES.default[node.type as keyof typeof COLOR_SCHEMES.default] || COLOR_SCHEMES.default.note
  }, [])

  const getNodeSize = useCallback((node: GraphNode): number => {
    const baseSize = 8
    const degree = typeof node.degree === 'number' && isFinite(node.degree) ? node.degree : 0
    const tagCount = Array.isArray(node.tags) ? node.tags.length : 0
    const degreeBonus = degree * 2
    const tagBonus = tagCount * 1.5
    const size = baseSize + degreeBonus + tagBonus
    // Ensure size is finite and within reasonable bounds
    return isFinite(size) && size > 0 && size < 100 ? size : 8
  }, [])

  const getEdgeStyle = useCallback((edge: GraphEdge): { color: string; width: number; dash?: number[] } => {
    const baseColor = 'rgba(139, 92, 246, 0.4)'
    switch (edge.type) {
      case 'wikilink':
        return { color: baseColor, width: 2 }
      case 'tag':
        return { color: 'rgba(6, 182, 212, 0.4)', width: 1.5, dash: [5, 5] }
      case 'backlink':
        return { color: 'rgba(245, 158, 11, 0.4)', width: 1.5, dash: [2, 2] }
      default:
        return { color: baseColor, width: 1 }
    }
  }, [])

  const availableTags = useMemo(() => {
    if (!graphData?.nodes) return []
    const tags = new Set<string>()
    graphData.nodes.forEach(node => {
      node.tags?.forEach(tag => tags.add(tag))
    })
    return Array.from(tags).sort()
  }, [graphData])

  const transformData = useCallback((): GraphData => {
    if (!graphData) return { nodes: [], links: [] }

    // Ensure nodes have required fields
    const validatedNodes = graphData.nodes.map(node => ({
      ...node,
      type: node.type || 'note',  // Ensure type is set
      degree: typeof node.degree === 'number' && isFinite(node.degree) ? node.degree : 0,
      tags: Array.isArray(node.tags) ? node.tags : []
    }))

    // Ensure edges have required fields
    const validatedEdges = graphData.edges.map(edge => ({
      ...edge,
      type: edge.type || 'wikilink',
      weight: typeof edge.weight === 'number' && isFinite(edge.weight) ? edge.weight : 1.0
    }))

    let filteredNodes = validatedNodes
    let filteredEdges = validatedEdges

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filteredNodes = filteredNodes.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.tags?.some(tag => tag.toLowerCase().includes(query))
      )
    }

    if (filterTag !== 'all') {
      filteredNodes = filteredNodes.filter(n => n.tags?.includes(filterTag))
    }

    if (filterType !== 'all') {
      filteredNodes = filteredNodes.filter(n => n.type === filterType)
    }

    const nodeIds = new Set(filteredNodes.map(n => n.id))
    filteredEdges = filteredEdges.filter(
      e => nodeIds.has(e.source) && nodeIds.has(e.target)
    )

    return {
      nodes: filteredNodes.map(n => ({
        ...n,
        type: n.type || 'note',
        degree: typeof n.degree === 'number' && isFinite(n.degree) ? n.degree : 0,
        tags: Array.isArray(n.tags) ? n.tags : []
      })),
      links: filteredEdges.map(e => ({
        source: typeof e.source === 'string' ? e.source : String(e.source),
        target: typeof e.target === 'string' ? e.target : String(e.target),
        type: e.type || 'wikilink',
        context: e.context,
        weight: typeof e.weight === 'number' && isFinite(e.weight) ? e.weight : 1.0
      })),
    }
  }, [graphData, searchQuery, filterTag, filterType])

  const handleNodeClick = useCallback(
    (node: any) => {
      if (node.type === 'note') {
        router.push(`/notebooks/${notebookId}?note=${node.id}`)
      }
      setSelectedNode(node)
    },
    [router, notebookId]
  )

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node)
    if (graphRef.current) {
      document.body.style.cursor = node ? 'pointer' : 'default'
    }
  }, [])

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      // Validate node coordinates before rendering
      if (
        typeof node.x !== 'number' || !isFinite(node.x) ||
        typeof node.y !== 'number' || !isFinite(node.y)
      ) {
        // Skip rendering if coordinates are invalid (node not positioned yet)
        return
      }

      const baseSize = getNodeSize(node)
      let size = baseSize / Math.sqrt(globalScale)
      
      // Ensure size is a valid finite number
      if (typeof size !== 'number' || !isFinite(size) || size <= 0) {
        size = 8 / Math.sqrt(globalScale) // Default fallback size
      }
      
      const color = getNodeColor(node, colorScheme)
      const isHovered = hoveredNode?.id === node.id
      const isSelected = selectedNode?.id === node.id
      const isHub = (node.degree || 0) >= 3

      ctx.beginPath()
      
      if (isHub) {
        ctx.moveTo(node.x, node.y - size)
        ctx.lineTo(node.x + size, node.y)
        ctx.lineTo(node.x, node.y + size)
        ctx.lineTo(node.x - size, node.y)
        ctx.closePath()
      } else if (node.type === 'tag') {
        ctx.rect(node.x - size, node.y - size, size * 2, size * 2)
      } else {
        ctx.arc(node.x, node.y, isHovered || isSelected ? size * 1.5 : size, 0, 2 * Math.PI)
      }
      
      // Validate all values before creating gradient
      const x0 = isFinite(node.x) ? node.x : 0
      const y0 = isFinite(node.y) ? node.y : 0
      const r0 = 0
      const x1 = isFinite(node.x) ? node.x : 0
      const y1 = isFinite(node.y) ? node.y : 0
      const r1 = isFinite(size) && size > 0 ? size : 8 / Math.sqrt(globalScale)

      const gradient = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1)
      gradient.addColorStop(0, color)
      gradient.addColorStop(1, `${color}80`)
      ctx.fillStyle = gradient
      ctx.fill()

      if (isSelected) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 3
        ctx.stroke()
      } else if (isHovered) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      if (globalScale >= 0.6 && node.title) {
        const label = node.title.length > 18 ? node.title.slice(0, 18) + '...' : node.title
        const fontSize = 11 / Math.sqrt(globalScale)
        if (isFinite(fontSize) && fontSize > 0) {
          ctx.font = `${fontSize}px Sans-Serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
          const labelWidth = ctx.measureText(label).width + 8
          const labelHeight = 16 / globalScale
          if (isFinite(labelWidth) && isFinite(labelHeight)) {
            ctx.fillRect(node.x - labelWidth / 2, node.y + size + 4, labelWidth, labelHeight)
            
            ctx.fillStyle = '#ffffff'
            const labelY = node.y + size + 12 / Math.sqrt(globalScale)
            if (isFinite(labelY)) {
              ctx.fillText(label, node.x, labelY)
            }
          }
        }
      }

      if (showDegrees && globalScale >= 0.8 && (node.degree || 0) > 0) {
        const badgeText = String(node.degree)
        const badgeFontSize = 8 / Math.sqrt(globalScale)
        const badgeRadius = 6 / Math.sqrt(globalScale)
        
        if (isFinite(badgeFontSize) && isFinite(badgeRadius) && badgeRadius > 0) {
          ctx.font = `bold ${badgeFontSize}px Sans-Serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          
          const badgeX = node.x + size - 2
          const badgeY = node.y - size + 2
          
          if (isFinite(badgeX) && isFinite(badgeY)) {
            ctx.beginPath()
            ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI)
            ctx.fillStyle = '#1f2937'
            ctx.fill()
            
            ctx.fillStyle = '#ffffff'
            ctx.fillText(badgeText, badgeX, badgeY)
          }
        }
      }
    },
    [hoveredNode, selectedNode, colorScheme, getNodeSize, getNodeColor, showDegrees]
  )

  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      // Validate link source and target coordinates
      if (
        !link.source || !link.target ||
        typeof link.source.x !== 'number' || !isFinite(link.source.x) ||
        typeof link.source.y !== 'number' || !isFinite(link.source.y) ||
        typeof link.target.x !== 'number' || !isFinite(link.target.x) ||
        typeof link.target.y !== 'number' || !isFinite(link.target.y)
      ) {
        // Skip rendering if coordinates are invalid
        return
      }

      const style = getEdgeStyle(link)
      ctx.beginPath()
      ctx.moveTo(link.source.x, link.source.y)
      ctx.lineTo(link.target.x, link.target.y)
      ctx.strokeStyle = style.color
      
      const lineWidth = style.width / Math.sqrt(globalScale)
      ctx.lineWidth = isFinite(lineWidth) && lineWidth > 0 ? lineWidth : 1
      
      if (style.dash) {
        ctx.setLineDash(style.dash)
      } else {
        ctx.setLineDash([])
      }
      ctx.stroke()
      ctx.setLineDash([])
    },
    [getEdgeStyle]
  )

  const handleZoomIn = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoom(graphRef.current.zoom() * 1.3)
    }
  }, [])

  const handleZoomOut = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoom(graphRef.current.zoom() / 1.3)
    }
  }, [])

  const handleFitView = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.fitView(400)
    }
  }, [])

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setFilterTag('all')
    setFilterType('all')
  }, [])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="w-full" style={{ height }} />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center" style={{ height }}>
          <p className="text-muted-foreground">{t.obsidian.failedToLoadGraph}</p>
        </CardContent>
      </Card>
    )
  }

  const data = transformData()

  if (data.nodes.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center" style={{ height }}>
          <p className="text-muted-foreground">{t.obsidian.noNotesInNotebook}</p>
        </CardContent>
      </Card>
    )
  }

  const hasActiveFilters = searchQuery || filterTag !== 'all' || filterType !== 'all'

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5 text-purple-500" />
              {t.obsidian.knowledgeGraph}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
                {t.obsidian.refreshKnowledgeGraph}
              </Button>
              <Badge variant="outline" className="bg-purple-500/10">
                {data.nodes.length} {t.obsidian.nodes}
              </Badge>
              <Badge variant="outline" className="bg-purple-500/10">
                {data.links.length} {t.obsidian.links}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t.obsidian.searchNodes}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {availableTags.map(tag => (
                  <SelectItem key={tag} value={tag}>#{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="note">Notes</SelectItem>
                <SelectItem value="tag">Tags</SelectItem>
                <SelectItem value="source">Sources</SelectItem>
              </SelectContent>
            </Select>

            <Select value={colorScheme} onValueChange={(v) => setColorScheme(v as ColorScheme)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Color scheme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Colors</SelectItem>
                <SelectItem value="tags">By Tags</SelectItem>
                <SelectItem value="degree">By Connections</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1">
              <Button
                variant={showTags ? "default" : "outline"}
                size="sm"
                onClick={() => setShowTags(!showTags)}
              >
                <Hash className="h-4 w-4" />
              </Button>
              <Button
                variant={showDegrees ? "default" : "outline"}
                size="sm"
                onClick={() => setShowDegrees(!showDegrees)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden">
        <CardContent className="p-0">
          <div style={{ height }}>
            <ForceGraph2D
              ref={graphRef}
              graphData={data}
              nodeCanvasObject={paintNode}
              linkCanvasObject={paintLink}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              linkColor={() => 'rgba(139, 92, 246, 0.3)'}
              linkWidth={1}
              linkDirectionalParticles={2}
              linkDirectionalParticleWidth={1.5}
              linkDirectionalParticleColor={() => '#8b5cf6'}
              cooldownTicks={100}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              enableNodeDrag
              enableZoomInteraction
              enablePanInteraction
            />
          </div>
          <div className="absolute bottom-4 right-4 flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={handleFitView}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {(selectedNode || hoveredNode) && (() => {
        const node = (selectedNode || hoveredNode) as GraphNode
        return (
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge
                    style={{
                      backgroundColor: `${getNodeColor(node, colorScheme)}20`,
                      color: getNodeColor(node, colorScheme),
                    }}
                  >
                    {node?.type}
                  </Badge>
                  {node?.degree !== undefined && (
                    <Badge variant="outline">
                      {node?.degree} connections
                    </Badge>
                  )}
                </div>
                <h3 className="font-semibold text-lg">
                  {node?.title}
                </h3>
                {node?.tags && node?.tags!.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {node?.tags?.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {node?.created && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Created: {new Date(node?.created || '').toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedNode(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
        )
      })()}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {graphData?.nodes.filter(n => n.type === 'note').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Hubs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {graphData?.nodes.filter(n => (n.degree || 0) >= 3).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Orphans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-500">
              {graphData?.nodes.filter(n => (n.degree || 0) === 0).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Degree</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {graphData?.nodes.length
                ? (graphData.nodes.reduce((sum, n) => sum + (n.degree || 0), 0) / graphData.nodes.length).toFixed(1)
                : 0}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
