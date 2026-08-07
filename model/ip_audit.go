package model

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	IPAuditRetentionDays     = 30
	IPAuditMaxEvaluationRows = 2000
)

const (
	IPAuditFilterAll    = "all"
	IPAuditFilterCount  = "count"
	IPAuditFilterRPM    = "rpm"
	IPAuditFilterAny    = "any"
	IPAuditFilterNormal = "normal"
)

type IPAuditMinute struct {
	UserID           int    `json:"user_id" gorm:"primaryKey;autoIncrement:false;index:idx_ip_audit_user_minute,priority:1"`
	IP               string `json:"ip" gorm:"size:64;primaryKey"`
	Minute           int64  `json:"minute" gorm:"primaryKey;autoIncrement:false;index;index:idx_ip_audit_user_minute,priority:2"`
	Username         string `json:"username" gorm:"size:191;default:''"`
	RequestCount     int64  `json:"request_count" gorm:"default:0"`
	FirstSeenAt      int64  `json:"first_seen_at" gorm:"bigint;index"`
	LastSeenAt       int64  `json:"last_seen_at" gorm:"bigint;index"`
	CountryISO       string `json:"country_iso" gorm:"size:2;index"`
	ASNNumber        int64  `json:"asn_number" gorm:"bigint;index"`
	ASNOrganization  string `json:"asn_organization" gorm:"size:255"`
	ResolverVersion  string `json:"resolver_version" gorm:"size:96"`
	IPKind           string `json:"ip_kind" gorm:"size:24;index"`
	EvidenceEligible bool   `json:"evidence_eligible" gorm:"index"`
}

func (IPAuditMinute) TableName() string {
	return "ip_audit_minutes"
}

type IPAuditQuery struct {
	StartAt          int64
	EndAt            int64
	RequestThreshold int64
	UserThreshold    int64
	RPMThreshold     int64
	Page             int
	PageSize         int
	Keyword          string
	Anomaly          string
	Sort             string
}

type IPAuditThresholds struct {
	RequestCount int64 `json:"request_count"`
	UserCount    int64 `json:"user_count"`
	RPM          int64 `json:"rpm"`
}

type IPAuditSummary struct {
	TotalIPs        int64 `json:"total_ips"`
	TotalUsers      int64 `json:"total_users"`
	TotalRequests   int64 `json:"total_requests"`
	CountAnomalyIPs int64 `json:"count_anomaly_ips"`
	RPMAnomalyIPs   int64 `json:"rpm_anomaly_ips"`
	AnyAnomalyIPs   int64 `json:"any_anomaly_ips"`
}

type IPAuditUser struct {
	UserID       int    `json:"user_id"`
	Username     string `json:"username"`
	RequestCount int64  `json:"request_count"`
}

type IPAuditItem struct {
	IP                  string        `json:"ip"`
	RequestCount        int64         `json:"request_count"`
	UserCount           int64         `json:"user_count"`
	PeakRPM             int64         `json:"peak_rpm"`
	FirstSeenAt         int64         `json:"first_seen_at"`
	LastSeenAt          int64         `json:"last_seen_at"`
	RequestCountAnomaly bool          `json:"request_count_anomaly"`
	SharedUserAnomaly   bool          `json:"shared_user_anomaly"`
	CountAnomaly        bool          `json:"count_anomaly"`
	RPMAnomaly          bool          `json:"rpm_anomaly"`
	Users               []IPAuditUser `json:"users"`
	UsersTruncated      bool          `json:"users_truncated"`
}

type IPAuditResult struct {
	GeneratedAt   int64             `json:"generated_at"`
	StartAt       int64             `json:"start_at"`
	EndAt         int64             `json:"end_at"`
	RetentionDays int               `json:"retention_days"`
	Thresholds    IPAuditThresholds `json:"thresholds"`
	Summary       IPAuditSummary    `json:"summary"`
	Items         []IPAuditItem     `json:"items"`
	Page          int               `json:"page"`
	PageSize      int               `json:"page_size"`
	Total         int64             `json:"total"`
}

var (
	ipAuditCleanupDay atomic.Int64
	ipAuditCleanupMu  sync.Mutex
)

func RecordIPAuditRequest(userID int, username string, ip string, now time.Time) error {
	return RecordIPAuditObservation(IPAuditObservation{
		UserID:     userID,
		Username:   username,
		IP:         ip,
		IPKind:     "unknown",
		ObservedAt: now,
	})
}

type IPAuditObservation struct {
	UserID           int
	Username         string
	IP               string
	CountryISO       string
	ASNNumber        int64
	ASNOrganization  string
	ResolverVersion  string
	IPKind           string
	EvidenceEligible bool
	ObservedAt       time.Time
}

func RecordIPAuditObservation(observation IPAuditObservation) error {
	userID := observation.UserID
	username := observation.Username
	ip := strings.TrimSpace(observation.IP)
	now := observation.ObservedAt
	ip = strings.TrimSpace(ip)
	if userID <= 0 || ip == "" || DB == nil {
		return nil
	}

	now = now.UTC()
	minute := now.Truncate(time.Minute).Unix()
	row := &IPAuditMinute{
		UserID:           userID,
		IP:               ip,
		Minute:           minute,
		Username:         strings.TrimSpace(username),
		RequestCount:     1,
		FirstSeenAt:      now.Unix(),
		LastSeenAt:       now.Unix(),
		CountryISO:       strings.ToUpper(strings.TrimSpace(observation.CountryISO)),
		ASNNumber:        observation.ASNNumber,
		ASNOrganization:  strings.TrimSpace(observation.ASNOrganization),
		ResolverVersion:  strings.TrimSpace(observation.ResolverVersion),
		IPKind:           strings.TrimSpace(observation.IPKind),
		EvidenceEligible: observation.EvidenceEligible,
	}
	if row.IPKind == "" {
		row.IPKind = "unknown"
	}
	requestCountColumn := clause.Column{Table: clause.CurrentTable, Name: "request_count"}
	firstSeenAtColumn := clause.Column{Table: clause.CurrentTable, Name: "first_seen_at"}
	lastSeenAtColumn := clause.Column{Table: clause.CurrentTable, Name: "last_seen_at"}
	countryISOColumn := clause.Column{Table: clause.CurrentTable, Name: "country_iso"}
	asnNumberColumn := clause.Column{Table: clause.CurrentTable, Name: "asn_number"}
	asnOrganizationColumn := clause.Column{Table: clause.CurrentTable, Name: "asn_organization"}
	resolverVersionColumn := clause.Column{Table: clause.CurrentTable, Name: "resolver_version"}
	ipKindColumn := clause.Column{Table: clause.CurrentTable, Name: "ip_kind"}
	evidenceEligibleColumn := clause.Column{Table: clause.CurrentTable, Name: "evidence_eligible"}
	err := DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "user_id"},
			{Name: "ip"},
			{Name: "minute"},
		},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"username":      row.Username,
			"request_count": gorm.Expr("? + ?", requestCountColumn, 1),
			"first_seen_at": gorm.Expr(
				"CASE WHEN ? IS NULL OR ? = 0 OR ? > ? THEN ? ELSE ? END",
				firstSeenAtColumn, firstSeenAtColumn, firstSeenAtColumn, row.FirstSeenAt, row.FirstSeenAt, firstSeenAtColumn,
			),
			"last_seen_at": gorm.Expr(
				"CASE WHEN ? < ? THEN ? ELSE ? END",
				lastSeenAtColumn, row.LastSeenAt, row.LastSeenAt, lastSeenAtColumn,
			),
			"country_iso": gorm.Expr(
				"CASE WHEN ? THEN ? ELSE ? END", row.EvidenceEligible, row.CountryISO, countryISOColumn,
			),
			"asn_number": gorm.Expr(
				"CASE WHEN ? THEN ? ELSE ? END", row.EvidenceEligible, row.ASNNumber, asnNumberColumn,
			),
			"asn_organization": gorm.Expr(
				"CASE WHEN ? THEN ? ELSE ? END", row.EvidenceEligible, row.ASNOrganization, asnOrganizationColumn,
			),
			"resolver_version": gorm.Expr(
				"CASE WHEN ? THEN ? ELSE ? END", row.EvidenceEligible, row.ResolverVersion, resolverVersionColumn,
			),
			"ip_kind": gorm.Expr(
				"CASE WHEN ? THEN ? ELSE ? END", row.EvidenceEligible, row.IPKind, ipKindColumn,
			),
			"evidence_eligible": gorm.Expr(
				"CASE WHEN ? = ? OR ? THEN ? ELSE ? END",
				evidenceEligibleColumn, true, row.EvidenceEligible, true, false,
			),
		}),
	}).Create(row).Error
	if err != nil {
		return err
	}

	if err := cleanupIPAuditIfNeeded(now); err != nil {
		common.SysError(err.Error())
	}
	return nil
}

func cleanupIPAuditIfNeeded(now time.Time) error {
	day := now.UTC().Unix() / int64((24 * time.Hour).Seconds())
	if ipAuditCleanupDay.Load() == day {
		return nil
	}
	ipAuditCleanupMu.Lock()
	defer ipAuditCleanupMu.Unlock()
	if ipAuditCleanupDay.Load() == day {
		return nil
	}
	cutoff := now.UTC().AddDate(0, 0, -IPAuditRetentionDays).Truncate(time.Minute).Unix()
	if err := DB.Where("minute < ?", cutoff).Delete(&IPAuditMinute{}).Error; err != nil {
		return fmt.Errorf("clean expired IP audit rows: %w", err)
	}
	ipAuditCleanupDay.Store(day)
	return nil
}

type ipAuditAggregate struct {
	IP           string
	RequestCount int64
	UserCount    int64
	PeakRPM      int64
	FirstSeenAt  int64
	LastSeenAt   int64
}

type ipAuditUserAggregate struct {
	IP           string
	UserID       int
	Username     string
	RequestCount int64
}

func GetIPAudit(query IPAuditQuery) (*IPAuditResult, error) {
	query = normalizeIPAuditQuery(query)
	startMinute := time.Unix(query.StartAt, 0).UTC().Truncate(time.Minute).Unix()
	endMinute := time.Unix(query.EndAt, 0).UTC().Truncate(time.Minute).Unix()

	aggregates := make([]ipAuditAggregate, 0)
	err := DB.Model(&IPAuditMinute{}).
		Select(
			"ip, COALESCE(SUM(request_count), 0) AS request_count, "+
				"COUNT(DISTINCT user_id) AS user_count, "+
				"MIN(minute) AS first_seen_at, MAX(last_seen_at) AS last_seen_at",
		).
		Where("minute >= ? AND minute <= ?", startMinute, endMinute).
		Group("ip").
		Scan(&aggregates).Error
	if err != nil {
		return nil, err
	}

	minuteTotals := DB.Model(&IPAuditMinute{}).
		Select("ip, minute, COALESCE(SUM(request_count), 0) AS rpm").
		Where("minute >= ? AND minute <= ?", startMinute, endMinute).
		Group("ip, minute")
	peakRows := make([]struct {
		IP      string
		PeakRPM int64
	}, 0)
	err = DB.Table("(?) AS ip_minute_totals", minuteTotals).
		Select("ip, COALESCE(MAX(rpm), 0) AS peak_rpm").
		Group("ip").
		Scan(&peakRows).Error
	if err != nil {
		return nil, err
	}
	peakRPMByIP := make(map[string]int64, len(peakRows))
	for _, row := range peakRows {
		peakRPMByIP[row.IP] = row.PeakRPM
	}

	var totalUsers int64
	err = DB.Model(&IPAuditMinute{}).
		Where("minute >= ? AND minute <= ?", startMinute, endMinute).
		Distinct("user_id").
		Count(&totalUsers).Error
	if err != nil {
		return nil, err
	}

	result := &IPAuditResult{
		GeneratedAt:   time.Now().Unix(),
		StartAt:       query.StartAt,
		EndAt:         query.EndAt,
		RetentionDays: IPAuditRetentionDays,
		Thresholds: IPAuditThresholds{
			RequestCount: query.RequestThreshold,
			UserCount:    query.UserThreshold,
			RPM:          query.RPMThreshold,
		},
		Summary: IPAuditSummary{
			TotalIPs:   int64(len(aggregates)),
			TotalUsers: totalUsers,
		},
		Items:    make([]IPAuditItem, 0),
		Page:     query.Page,
		PageSize: query.PageSize,
	}

	items := make([]IPAuditItem, 0, len(aggregates))
	keyword := strings.ToLower(strings.TrimSpace(query.Keyword))
	for _, aggregate := range aggregates {
		aggregate.PeakRPM = peakRPMByIP[aggregate.IP]
		requestAnomaly := aggregate.RequestCount >= query.RequestThreshold
		sharedUserAnomaly := aggregate.UserCount >= query.UserThreshold
		countAnomaly := requestAnomaly || sharedUserAnomaly
		rpmAnomaly := aggregate.PeakRPM >= query.RPMThreshold

		result.Summary.TotalRequests += aggregate.RequestCount
		if countAnomaly {
			result.Summary.CountAnomalyIPs++
		}
		if rpmAnomaly {
			result.Summary.RPMAnomalyIPs++
		}
		if countAnomaly || rpmAnomaly {
			result.Summary.AnyAnomalyIPs++
		}

		if keyword != "" && !strings.Contains(strings.ToLower(aggregate.IP), keyword) {
			continue
		}
		if !matchesIPAuditFilter(query.Anomaly, countAnomaly, rpmAnomaly) {
			continue
		}
		items = append(items, IPAuditItem{
			IP:                  aggregate.IP,
			RequestCount:        aggregate.RequestCount,
			UserCount:           aggregate.UserCount,
			PeakRPM:             aggregate.PeakRPM,
			FirstSeenAt:         aggregate.FirstSeenAt,
			LastSeenAt:          aggregate.LastSeenAt,
			RequestCountAnomaly: requestAnomaly,
			SharedUserAnomaly:   sharedUserAnomaly,
			CountAnomaly:        countAnomaly,
			RPMAnomaly:          rpmAnomaly,
			Users:               make([]IPAuditUser, 0),
		})
	}

	sortIPAuditItems(items, query.Sort)
	result.Total = int64(len(items))
	start := (query.Page - 1) * query.PageSize
	if start >= len(items) {
		return result, nil
	}
	end := min(start+query.PageSize, len(items))
	result.Items = items[start:end]

	if err := attachIPAuditUsers(result.Items, startMinute, endMinute); err != nil {
		return nil, err
	}
	return result, nil
}

func normalizeIPAuditQuery(query IPAuditQuery) IPAuditQuery {
	if query.EndAt <= 0 {
		query.EndAt = time.Now().Unix()
	}
	if query.StartAt <= 0 || query.StartAt > query.EndAt {
		query.StartAt = query.EndAt - int64((24 * time.Hour).Seconds())
	}
	if query.RequestThreshold <= 0 {
		query.RequestThreshold = 1000
	}
	if query.UserThreshold <= 0 {
		query.UserThreshold = 3
	}
	if query.RPMThreshold <= 0 {
		query.RPMThreshold = 60
	}
	if query.Page <= 0 {
		query.Page = 1
	}
	if query.PageSize <= 0 {
		query.PageSize = 20
	}
	if query.PageSize > 100 {
		query.PageSize = 100
	}
	switch query.Anomaly {
	case IPAuditFilterCount, IPAuditFilterRPM, IPAuditFilterAny, IPAuditFilterNormal:
	default:
		query.Anomaly = IPAuditFilterAll
	}
	switch query.Sort {
	case "requests", "rpm", "users", "recent":
	default:
		query.Sort = "risk"
	}
	return query
}

func matchesIPAuditFilter(filter string, countAnomaly bool, rpmAnomaly bool) bool {
	switch filter {
	case IPAuditFilterCount:
		return countAnomaly
	case IPAuditFilterRPM:
		return rpmAnomaly
	case IPAuditFilterAny:
		return countAnomaly || rpmAnomaly
	case IPAuditFilterNormal:
		return !countAnomaly && !rpmAnomaly
	default:
		return true
	}
}

func sortIPAuditItems(items []IPAuditItem, sortBy string) {
	sort.SliceStable(items, func(i, j int) bool {
		left := items[i]
		right := items[j]
		switch sortBy {
		case "requests":
			if left.RequestCount != right.RequestCount {
				return left.RequestCount > right.RequestCount
			}
		case "rpm":
			if left.PeakRPM != right.PeakRPM {
				return left.PeakRPM > right.PeakRPM
			}
		case "users":
			if left.UserCount != right.UserCount {
				return left.UserCount > right.UserCount
			}
		case "recent":
			if left.LastSeenAt != right.LastSeenAt {
				return left.LastSeenAt > right.LastSeenAt
			}
		default:
			leftRisk := boolScore(left.CountAnomaly) + boolScore(left.RPMAnomaly)
			rightRisk := boolScore(right.CountAnomaly) + boolScore(right.RPMAnomaly)
			if leftRisk != rightRisk {
				return leftRisk > rightRisk
			}
			if left.PeakRPM != right.PeakRPM {
				return left.PeakRPM > right.PeakRPM
			}
		}
		if left.RequestCount != right.RequestCount {
			return left.RequestCount > right.RequestCount
		}
		return left.IP < right.IP
	})
}

func boolScore(value bool) int {
	if value {
		return 1
	}
	return 0
}

func attachIPAuditUsers(items []IPAuditItem, startMinute int64, endMinute int64) error {
	if len(items) == 0 {
		return nil
	}
	ips := make([]string, 0, len(items))
	for _, item := range items {
		ips = append(ips, item.IP)
	}

	userRows := make([]ipAuditUserAggregate, 0)
	err := DB.Model(&IPAuditMinute{}).
		Select(
			"ip, user_id, MAX(username) AS username, "+
				"COALESCE(SUM(request_count), 0) AS request_count",
		).
		Where("minute >= ? AND minute <= ? AND ip IN ?", startMinute, endMinute, ips).
		Group("ip, user_id").
		Scan(&userRows).Error
	if err != nil {
		return err
	}

	userIDs := make([]int, 0, len(userRows))
	seenUserIDs := make(map[int]struct{}, len(userRows))
	for _, row := range userRows {
		if _, exists := seenUserIDs[row.UserID]; exists {
			continue
		}
		seenUserIDs[row.UserID] = struct{}{}
		userIDs = append(userIDs, row.UserID)
	}
	currentUsernames := make(map[int]string, len(userIDs))
	if len(userIDs) > 0 {
		var users []User
		if err := DB.Select("id", "username").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
			return err
		}
		for _, user := range users {
			currentUsernames[user.Id] = user.Username
		}
	}

	usersByIP := make(map[string][]IPAuditUser, len(items))
	for _, row := range userRows {
		username := row.Username
		if currentUsername := currentUsernames[row.UserID]; currentUsername != "" {
			username = currentUsername
		}
		usersByIP[row.IP] = append(usersByIP[row.IP], IPAuditUser{
			UserID:       row.UserID,
			Username:     username,
			RequestCount: row.RequestCount,
		})
	}
	for i := range items {
		users := usersByIP[items[i].IP]
		sort.SliceStable(users, func(left int, right int) bool {
			if users[left].RequestCount != users[right].RequestCount {
				return users[left].RequestCount > users[right].RequestCount
			}
			return users[left].UserID < users[right].UserID
		})
		if len(users) > 5 {
			items[i].Users = users[:5]
			items[i].UsersTruncated = true
		} else {
			items[i].Users = users
		}
	}
	return nil
}

type IPAuditRiskQuery struct {
	StartAt  int64
	EndAt    int64
	Page     int
	PageSize int
	Keyword  string
	Sort     string
}

type IPAuditRiskEvidence struct {
	DistinctIPs       int             `json:"distinct_ips"`
	EligibleIPs       int             `json:"eligible_ips"`
	CountryCount      int             `json:"country_count"`
	ASNCount          int             `json:"asn_count"`
	RapidIPSwitch     bool            `json:"rapid_ip_switch"`
	MinimumGapSeconds int64           `json:"minimum_gap_seconds"`
	TriggersBan       bool            `json:"triggers_ban"`
	InputTruncated    bool            `json:"input_truncated"`
	Observations      []IPAuditMinute `json:"observations"`
}

type IPAuditRiskItem struct {
	UserID       int                 `json:"user_id"`
	Username     string              `json:"username"`
	RequestCount int64               `json:"request_count"`
	FirstSeenAt  int64               `json:"first_seen_at"`
	LastSeenAt   int64               `json:"last_seen_at"`
	Evidence     IPAuditRiskEvidence `json:"evidence"`
	Ban          *UserRelayBan       `json:"ban,omitempty"`
}

type IPAuditRiskSummary struct {
	TotalUsers      int64 `json:"total_users"`
	TotalRequests   int64 `json:"total_requests"`
	TriggeringUsers int64 `json:"triggering_users"`
	ActivelyBanned  int64 `json:"actively_banned"`
}

type IPAuditRiskResult struct {
	GeneratedAt   int64              `json:"generated_at"`
	StartAt       int64              `json:"start_at"`
	EndAt         int64              `json:"end_at"`
	RetentionDays int                `json:"retention_days"`
	Summary       IPAuditRiskSummary `json:"summary"`
	Items         []IPAuditRiskItem  `json:"items"`
	Page          int                `json:"page"`
	PageSize      int                `json:"page_size"`
	Total         int64              `json:"total"`
}

// BuildIPAuditRiskEvidence evaluates the exact half-open window
// (startExclusive, endInclusive]. Only complete, public resolver results can
// contribute to the country/ASN thresholds or the rapid different-IP test.
func BuildIPAuditRiskEvidence(rows []IPAuditMinute, startExclusive int64, endInclusive int64) IPAuditRiskEvidence {
	inputTruncated := len(rows) > IPAuditMaxEvaluationRows
	if inputTruncated {
		rows = rows[:IPAuditMaxEvaluationRows]
	}
	evidence := IPAuditRiskEvidence{
		MinimumGapSeconds: -1,
		InputTruncated:    inputTruncated,
		Observations:      make([]IPAuditMinute, 0, len(rows)),
	}
	type observationTime struct {
		IP        string
		Timestamp int64
	}
	allIPs := make(map[string]struct{})
	eligibleIPs := make(map[string]struct{})
	countries := make(map[string]struct{})
	asns := make(map[int64]struct{})
	eligibleTimes := make([]observationTime, 0, len(rows)*2)

	for _, row := range rows {
		timestamps := make([]int64, 0, 2)
		if row.FirstSeenAt > startExclusive && row.FirstSeenAt <= endInclusive {
			timestamps = append(timestamps, row.FirstSeenAt)
		}
		if row.LastSeenAt > startExclusive && row.LastSeenAt <= endInclusive && row.LastSeenAt != row.FirstSeenAt {
			timestamps = append(timestamps, row.LastSeenAt)
		}
		if len(timestamps) == 0 {
			continue
		}
		evidence.Observations = append(evidence.Observations, row)
		allIPs[row.IP] = struct{}{}
		if !row.EvidenceEligible || row.IPKind != "public" || row.CountryISO == "" || row.ASNNumber <= 0 {
			continue
		}
		eligibleIPs[row.IP] = struct{}{}
		countries[row.CountryISO] = struct{}{}
		asns[row.ASNNumber] = struct{}{}
		for _, timestamp := range timestamps {
			eligibleTimes = append(eligibleTimes, observationTime{IP: row.IP, Timestamp: timestamp})
		}
	}

	sort.Slice(eligibleTimes, func(left int, right int) bool {
		if eligibleTimes[left].Timestamp != eligibleTimes[right].Timestamp {
			return eligibleTimes[left].Timestamp < eligibleTimes[right].Timestamp
		}
		return eligibleTimes[left].IP < eligibleTimes[right].IP
	})
	for index := 1; index < len(eligibleTimes); index++ {
		previous := eligibleTimes[index-1]
		current := eligibleTimes[index]
		if previous.IP == current.IP {
			continue
		}
		gap := current.Timestamp - previous.Timestamp
		if evidence.MinimumGapSeconds < 0 || gap < evidence.MinimumGapSeconds {
			evidence.MinimumGapSeconds = gap
		}
	}

	evidence.DistinctIPs = len(allIPs)
	evidence.EligibleIPs = len(eligibleIPs)
	evidence.CountryCount = len(countries)
	evidence.ASNCount = len(asns)
	evidence.RapidIPSwitch = evidence.MinimumGapSeconds >= 0 && evidence.MinimumGapSeconds < 180
	evidence.TriggersBan = evidence.CountryCount >= 3 && evidence.ASNCount >= 3 && evidence.RapidIPSwitch
	sort.SliceStable(evidence.Observations, func(left int, right int) bool {
		if evidence.Observations[left].LastSeenAt != evidence.Observations[right].LastSeenAt {
			return evidence.Observations[left].LastSeenAt > evidence.Observations[right].LastSeenAt
		}
		return evidence.Observations[left].IP < evidence.Observations[right].IP
	})
	return evidence
}

func GetIPAuditRowsForEvaluation(userID int, startExclusive int64, endInclusive int64) ([]IPAuditMinute, error) {
	rows := make([]IPAuditMinute, 0, IPAuditMaxEvaluationRows+1)
	err := DB.Where(
		"user_id = ? AND last_seen_at > ? AND first_seen_at <= ?",
		userID, startExclusive, endInclusive,
	).Order("last_seen_at desc, ip asc").Limit(IPAuditMaxEvaluationRows + 1).Find(&rows).Error
	return rows, err
}

func GetIPAuditRisk(query IPAuditRiskQuery) (*IPAuditRiskResult, error) {
	if query.EndAt <= 0 {
		query.EndAt = GetDBTimestamp()
	}
	if query.StartAt <= 0 || query.StartAt >= query.EndAt {
		query.StartAt = query.EndAt - 600
	}
	if query.Page <= 0 {
		query.Page = 1
	}
	if query.PageSize <= 0 {
		query.PageSize = 20
	}
	if query.PageSize > 100 {
		query.PageSize = 100
	}

	base := DB.Model(&IPAuditMinute{}).
		Where("last_seen_at > ? AND first_seen_at <= ?", query.StartAt, query.EndAt)
	keyword := strings.ToLower(strings.TrimSpace(query.Keyword))
	if keyword != "" {
		base = base.Where("LOWER(username) LIKE ?", "%"+keyword+"%")
	}
	var total int64
	if err := base.Distinct("user_id").Count(&total).Error; err != nil {
		return nil, err
	}
	type requestTotal struct {
		Count int64
	}
	var totalRequests requestTotal
	if err := base.Select("COALESCE(SUM(request_count), 0) AS count").Scan(&totalRequests).Error; err != nil {
		return nil, err
	}

	type userAggregate struct {
		UserID       int
		Username     string
		RequestCount int64
		FirstSeenAt  int64
		LastSeenAt   int64
	}
	aggregates := make([]userAggregate, 0, query.PageSize)
	order := "last_seen_at desc, user_id asc"
	switch query.Sort {
	case "requests":
		order = "request_count desc, user_id asc"
	case "oldest":
		order = "first_seen_at asc, user_id asc"
	}
	err := base.Select(
		"user_id, MAX(username) AS username, COALESCE(SUM(request_count), 0) AS request_count, " +
			"MIN(first_seen_at) AS first_seen_at, MAX(last_seen_at) AS last_seen_at",
	).Group("user_id").Order(order).
		Limit(query.PageSize).Offset((query.Page - 1) * query.PageSize).
		Scan(&aggregates).Error
	if err != nil {
		return nil, err
	}

	result := &IPAuditRiskResult{
		GeneratedAt:   GetDBTimestamp(),
		StartAt:       query.StartAt,
		EndAt:         query.EndAt,
		RetentionDays: IPAuditRetentionDays,
		Items:         make([]IPAuditRiskItem, 0, len(aggregates)),
		Page:          query.Page,
		PageSize:      query.PageSize,
		Total:         total,
	}
	result.Summary.TotalUsers = total
	result.Summary.TotalRequests = totalRequests.Count
	if len(aggregates) == 0 {
		return result, nil
	}

	userIDs := make([]int, 0, len(aggregates))
	for _, aggregate := range aggregates {
		userIDs = append(userIDs, aggregate.UserID)
	}
	rows := make([]IPAuditMinute, 0)
	if err := DB.Where(
		"user_id IN ? AND last_seen_at > ? AND first_seen_at <= ?",
		userIDs, query.StartAt, query.EndAt,
	).Find(&rows).Error; err != nil {
		return nil, err
	}
	rowsByUser := make(map[int][]IPAuditMinute, len(userIDs))
	for _, row := range rows {
		rowsByUser[row.UserID] = append(rowsByUser[row.UserID], row)
	}

	currentUsernames := make(map[int]string, len(userIDs))
	users := make([]User, 0, len(userIDs))
	if err := DB.Select("id", "username").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
		return nil, err
	}
	for _, user := range users {
		currentUsernames[user.Id] = user.Username
	}
	banByUser, err := GetUserRelayBansByUserIDs(userIDs)
	if err != nil {
		return nil, err
	}

	for _, aggregate := range aggregates {
		evidence := BuildIPAuditRiskEvidence(rowsByUser[aggregate.UserID], query.StartAt, query.EndAt)
		username := aggregate.Username
		if currentUsernames[aggregate.UserID] != "" {
			username = currentUsernames[aggregate.UserID]
		}
		item := IPAuditRiskItem{
			UserID:       aggregate.UserID,
			Username:     username,
			RequestCount: aggregate.RequestCount,
			FirstSeenAt:  aggregate.FirstSeenAt,
			LastSeenAt:   aggregate.LastSeenAt,
			Evidence:     evidence,
		}
		if ban, ok := banByUser[aggregate.UserID]; ok {
			banCopy := ban
			item.Ban = &banCopy
			if ban.ActiveAt(query.EndAt) {
				result.Summary.ActivelyBanned++
			}
		}
		if evidence.TriggersBan {
			result.Summary.TriggeringUsers++
		}
		result.Items = append(result.Items, item)
	}
	return result, nil
}
